import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from './auth.service';

jest.mock('bcrypt');

type PrismaMock = {
  $transaction: jest.Mock;
  organization: { create: jest.Mock };
  user: { create: jest.Mock; findUnique: jest.Mock };
  userOrganization: { create: jest.Mock };
  refreshToken: {
    create: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
};

function sha256(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaMock;
  let jwt: { sign: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
      organization: { create: jest.fn() },
      user: { create: jest.fn(), findUnique: jest.fn() },
      userOrganization: { create: jest.fn() },
      refreshToken: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    jwt = { sign: jest.fn().mockReturnValue('signed.jwt.token') };
    config = {
      get: jest.fn((_key: string, def?: unknown) => def ?? '30'),
    };

    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      config as unknown as ConfigService,
    );

    jest.clearAllMocks();
    jwt.sign.mockReturnValue('signed.jwt.token');
    config.get.mockImplementation((_key: string, def?: unknown) => def ?? '30');
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
  });

  describe('register', () => {
    it('creates org, user, membership in one transaction and returns tokens', async () => {
      prisma.organization.create.mockResolvedValue({ id: 'org-1' });
      prisma.user.create.mockResolvedValue({ id: 'user-1' });
      prisma.userOrganization.create.mockResolvedValue({});
      let createCall:
        | { data: { userId: string; tokenHash: string } }
        | undefined;
      prisma.refreshToken.create.mockImplementation((args: unknown) => {
        createCall = args as { data: { userId: string; tokenHash: string } };
        return Promise.resolve({});
      });

      const result = await service.register({
        email: 'a@example.com',
        password: 'password123',
        organizationName: 'Acme',
      });

      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 12);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.organization.create).toHaveBeenCalledWith({
        data: { name: 'Acme' },
      });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: { email: 'a@example.com', passwordHash: 'hashed-password' },
      });
      expect(prisma.userOrganization.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', orgId: 'org-1', role: Role.ADMIN },
      });
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(jwt.sign).toHaveBeenCalledWith({
        sub: 'user-1',
        orgId: 'org-1',
        role: Role.ADMIN,
      });

      expect(createCall?.data.userId).toBe('user-1');
      expect(createCall?.data.tokenHash).toBe(sha256(result.refreshToken));
    });

    it('throws ConflictException on duplicate email (P2002)', async () => {
      prisma.$transaction.mockImplementation(() => {
        throw new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: '6.0.0',
        });
      });

      await expect(
        service.register({
          email: 'dup@example.com',
          password: 'password123',
          organizationName: 'Acme',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    const activeUser = {
      id: 'user-1',
      isActive: true,
      passwordHash: 'hashed-password',
      organizations: [
        { orgId: 'org-1', role: Role.ADMIN, createdAt: new Date() },
      ],
    };

    it('returns tokens on valid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.login({
        email: 'a@example.com',
        password: 'password123',
      });

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(jwt.sign).toHaveBeenCalledWith({
        sub: 'user-1',
        orgId: 'org-1',
        role: Role.ADMIN,
      });
    });

    it('rejects wrong password with UnauthorizedException', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: 'a@example.com', password: 'wrong' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects unknown email with the same exception/message as wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      let unknownEmailError: unknown;
      try {
        await service.login({ email: 'nobody@example.com', password: 'x' });
      } catch (e) {
        unknownEmailError = e;
      }

      prisma.user.findUnique.mockResolvedValue(activeUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      let wrongPasswordError: unknown;
      try {
        await service.login({ email: 'a@example.com', password: 'wrong' });
      } catch (e) {
        wrongPasswordError = e;
      }

      expect(unknownEmailError).toBeInstanceOf(UnauthorizedException);
      expect(wrongPasswordError).toBeInstanceOf(UnauthorizedException);
      expect((unknownEmailError as UnauthorizedException).message).toBe(
        (wrongPasswordError as UnauthorizedException).message,
      );
    });

    it('rejects an inactive user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...activeUser,
        isActive: false,
      });

      await expect(
        service.login({ email: 'a@example.com', password: 'password123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    const validRecord = {
      id: 'rt-1',
      userId: 'user-1',
      revoked: false,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      user: {
        organizations: [
          { orgId: 'org-1', role: Role.MEMBER, createdAt: new Date() },
        ],
      },
    };

    it('rotates the token: revokes old, issues new pair', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue(validRecord);
      prisma.refreshToken.update.mockResolvedValue({});
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.refresh({ refreshToken: 'raw-token' });

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: { revoked: true },
      });
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
      expect(result.accessToken).toBe('signed.jwt.token');
    });

    it('rejects when token is not found', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue(null);

      await expect(
        service.refresh({ refreshToken: 'unknown' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a revoked token without mutating anything', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue({
        ...validRecord,
        revoked: true,
      });

      await expect(
        service.refresh({ refreshToken: 'raw-token' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('rejects an expired token', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue({
        ...validRecord,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.refresh({ refreshToken: 'raw-token' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('revokes a valid, non-revoked token', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue({
        id: 'rt-1',
        revoked: false,
      });
      prisma.refreshToken.update.mockResolvedValue({});

      await service.logout({ refreshToken: 'raw-token' });

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: { revoked: true },
      });
    });

    it('is an idempotent no-op for an unknown or already-revoked token', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue(null);

      await expect(
        service.logout({ refreshToken: 'unknown' }),
      ).resolves.toBeUndefined();
      expect(prisma.refreshToken.update).not.toHaveBeenCalled();

      prisma.refreshToken.findFirst.mockResolvedValue({
        id: 'rt-1',
        revoked: true,
      });

      await expect(
        service.logout({ refreshToken: 'already-revoked' }),
      ).resolves.toBeUndefined();
      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
    });
  });
});
