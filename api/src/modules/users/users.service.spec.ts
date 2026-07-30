import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: { user: { findUnique: jest.Mock } };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    service = new UsersService(prisma as unknown as PrismaService);
  });

  it('returns the user with their organizations', async () => {
    const user = {
      id: 'user-1',
      email: 'a@example.com',
      isActive: true,
      createdAt: new Date(),
      organizations: [
        {
          orgId: 'org-1',
          role: 'ADMIN',
          createdAt: new Date(),
          org: { id: 'org-1', name: 'Acme' },
        },
      ],
    };
    prisma.user.findUnique.mockResolvedValue(user);

    const result = await service.getMe('user-1');

    expect(result).toEqual(user);
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' } }),
    );
  });

  it('throws NotFoundException when the user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.getMe('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
