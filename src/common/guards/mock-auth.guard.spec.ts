import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../enums/role.enum';
import { MockAuthGuard } from './mock-auth.guard';

describe('MockAuthGuard', () => {
  let guard: MockAuthGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new MockAuthGuard(reflector);
  });

  const createMockContext = (
    headers: Record<string, string>,
    isPublic = false,
  ): ExecutionContext => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(isPublic);
    const req: Record<string, unknown> = { headers };
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as unknown as ExecutionContext;
  };

  it('should allow public endpoints without headers', async () => {
    const ctx = createMockContext({}, true);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('should authenticate valid x-user-id and x-user-role headers', async () => {
    const ctx = createMockContext({
      'x-user-id': '11111111-1111-4111-8111-111111111111',
      'x-user-role': 'admin',
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    const req = ctx.switchToHttp().getRequest();
    expect(req.user).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      role: Role.ADMIN,
    });
  });

  it('should reject when an agent attempts to claim ADMIN role (privilege escalation)', async () => {
    const ctx = createMockContext({
      'x-user-id': '22222222-2222-4222-8222-222222222222', // Bob Agent
      'x-user-role': 'ADMIN',
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('should reject unknown user UUID', async () => {
    const ctx = createMockContext({
      'x-user-id': '99999999-9999-4999-8999-999999999999',
      'x-user-role': 'ADMIN',
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when headers are missing', async () => {
    const ctx = createMockContext({});
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when x-user-id is not a valid UUID', async () => {
    const ctx = createMockContext({
      'x-user-id': 'not-a-uuid',
      'x-user-role': 'ADMIN',
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });
});
