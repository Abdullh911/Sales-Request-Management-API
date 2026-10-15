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

  it('should allow public endpoints without headers', () => {
    const ctx = createMockContext({}, true);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should authenticate valid x-user-id and x-user-role headers', () => {
    const ctx = createMockContext({
      'x-user-id': '11111111-1111-4111-8111-111111111111',
      'x-user-role': 'admin',
    });

    expect(guard.canActivate(ctx)).toBe(true);
    const req = ctx.switchToHttp().getRequest();
    expect(req.user).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      role: Role.ADMIN,
    });
  });

  it('should throw UnauthorizedException when headers are missing', () => {
    const ctx = createMockContext({});
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when x-user-id is not a valid UUID', () => {
    const ctx = createMockContext({
      'x-user-id': 'not-a-uuid',
      'x-user-role': 'ADMIN',
    });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
