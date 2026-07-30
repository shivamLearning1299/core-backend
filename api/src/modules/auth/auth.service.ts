import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';

const SALT_ROUNDS = 12;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// Membership ordering used to pick which org/role goes into the JWT for a user
// that may belong to multiple orgs: the oldest UserOrganization membership by
// createdAt. There's no org-switcher UI yet, so this is an explicit MVP
// simplification, not an oversight — revisit when multi-org switching ships.
const oldestMembership = { orderBy: { createdAt: 'asc' as const }, take: 1 };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthTokens> {
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    let user: { id: string };
    let org: { id: string };
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const createdOrg = await tx.organization.create({
          data: { name: dto.organizationName },
        });
        const createdUser = await tx.user.create({
          data: { email: dto.email, passwordHash },
        });
        await tx.userOrganization.create({
          data: {
            userId: createdUser.id,
            orgId: createdOrg.id,
            role: Role.ADMIN,
          },
        });
        return { user: createdUser, org: createdOrg };
      });
      user = result.user;
      org = result.org;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Email already registered');
      }
      throw err;
    }

    return this.issueTokenPair(user.id, org.id, Role.ADMIN);
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { organizations: oldestMembership },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const membership = user.organizations[0];
    if (!membership) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueTokenPair(user.id, membership.orgId, membership.role);
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthTokens> {
    const tokenHash = this.hashToken(dto.refreshToken);
    const record = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
      include: { user: { include: { organizations: oldestMembership } } },
    });

    if (!record || record.revoked || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const membership = record.user.organizations[0];
    if (!membership) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revoked: true },
    });

    return this.issueTokenPair(
      record.userId,
      membership.orgId,
      membership.role,
    );
  }

  async logout(dto: RefreshTokenDto): Promise<void> {
    const tokenHash = this.hashToken(dto.refreshToken);
    const record = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
    });

    if (!record || record.revoked) {
      return;
    }

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revoked: true },
    });
  }

  private async issueTokenPair(
    userId: string,
    orgId: string,
    role: Role,
  ): Promise<AuthTokens> {
    const accessToken = this.jwt.sign({ sub: userId, orgId, role });

    const rawRefreshToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawRefreshToken);
    const days = Number(this.config.get('JWT_REFRESH_EXPIRES_IN_DAYS', '30'));
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    return { accessToken, refreshToken: rawRefreshToken };
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
