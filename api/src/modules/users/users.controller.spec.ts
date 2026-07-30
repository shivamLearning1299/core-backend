import { Request } from 'express';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: { getMe: jest.Mock };

  beforeEach(() => {
    usersService = { getMe: jest.fn() };
    controller = new UsersController(usersService as unknown as UsersService);
  });

  it('returns the current user using req.user.userId', async () => {
    const me = { id: 'user-1', email: 'a@example.com' };
    usersService.getMe.mockResolvedValue(me);
    const req = {
      user: { userId: 'user-1' } as AuthenticatedUser,
    } as Request & {
      user: AuthenticatedUser;
    };

    const result = await controller.me(req);

    expect(usersService.getMe).toHaveBeenCalledWith('user-1');
    expect(result).toBe(me);
  });
});
