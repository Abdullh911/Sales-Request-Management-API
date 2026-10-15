import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { Role } from '../enums/role.enum';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Simple mock authentication guard.
 * Reads `x-user-id` (UUID) and `x-user-role` (`ADMIN` or `AGENT`) from request headers.
 * Endpoints decorated with `@Public()` bypass this guard.
 */
@Injectable()
export class MockAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const rawUserId = request.headers['x-user-id'];
    const rawUserRole = request.headers['x-user-role'];

    const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
    const userRole = Array.isArray(rawUserRole) ? rawUserRole[0] : rawUserRole;

    if (!userId || !userRole) {
      throw new UnauthorizedException(
        'Missing authentication headers. Please provide both "x-user-id" (UUID) and "x-user-role" (ADMIN or AGENT).',
      );
    }

    if (!UUID_REGEX.test(userId.trim())) {
      throw new UnauthorizedException(
        'Invalid "x-user-id" header format. Expected a valid UUID.',
      );
    }

    const normalizedRole = userRole.trim().toUpperCase() as Role;
    if (!Object.values(Role).includes(normalizedRole)) {
      throw new UnauthorizedException(
        `Invalid "x-user-role" header "${userRole}". Allowed values: ${Object.values(Role).join(', ')}.`,
      );
    }

    const user: AuthenticatedUser = {
      id: userId.trim(),
      role: normalizedRole,
    };

    request.user = user;
    return true;
  }
}
