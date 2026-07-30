import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    register: jest.Mock;
    login: jest.Mock;
    refresh: jest.Mock;
    logout: jest.Mock;
  };

  beforeEach(() => {
    authService = {
      register: jest.fn(),
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
    };
    controller = new AuthController(authService as unknown as AuthService);
  });

  it('delegates register to AuthService', async () => {
    const dto = {
      email: 'a@example.com',
      password: 'password123',
      organizationName: 'Acme',
    };
    authService.register.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
    });

    const result = await controller.register(dto);

    expect(authService.register).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ accessToken: 'a', refreshToken: 'r' });
  });

  it('delegates login to AuthService', async () => {
    const dto = { email: 'a@example.com', password: 'password123' };
    authService.login.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
    });

    const result = await controller.login(dto);

    expect(authService.login).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ accessToken: 'a', refreshToken: 'r' });
  });

  it('delegates refresh to AuthService', async () => {
    const dto = { refreshToken: 'raw-token' };
    authService.refresh.mockResolvedValue({
      accessToken: 'a2',
      refreshToken: 'r2',
    });

    const result = await controller.refresh(dto);

    expect(authService.refresh).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ accessToken: 'a2', refreshToken: 'r2' });
  });

  it('delegates logout to AuthService', async () => {
    const dto = { refreshToken: 'raw-token' };
    authService.logout.mockResolvedValue(undefined);

    await controller.logout(dto);

    expect(authService.logout).toHaveBeenCalledWith(dto);
  });
});
