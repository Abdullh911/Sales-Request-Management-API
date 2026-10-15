import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DEFAULT_SEED_USERS, UsersService } from '../../users/users.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { Role } from '../enums/role.enum';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Mock authentication guard.
 * Reads `x-user-id` (UUID) and optional `x-user-role` from request headers.
 * Verifies that the user exists and their role matches their stored user record,
 * preventing agents from claiming admin privileges.
 * Endpoints decorated with `@Public()` bypass this guard.
 */
@Injectable()
export class MockAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Optional() private readonly usersService?: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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

    if (!userId) {
      throw new UnauthorizedException(
        'Missing authentication header. Please provide "x-user-id" (UUID).',
      );
    }

    const trimmedUserId = userId.trim();
    if (!UUID_REGEX.test(trimmedUserId)) {
      throw new UnauthorizedException(
        'Invalid "x-user-id" header format. Expected a valid UUID.',
      );
    }

    // Look up the user from the database or fall back to the fixed seed mapping
    let storedUser: { id: string; role: Role } | null = null;
    if (this.usersService) {
      try {
        const found = await this.usersService.findById(trimmedUserId);
        if (found) {
          storedUser = { id: found.id, role: found.role };
        }
      } catch {
        // Fall back to seed users if DB is unavailable in test harness
      }
    }

    if (!storedUser) {
      const seedFound = DEFAULT_SEED_USERS.find((u) => u.id === trimmedUserId);
      if (seedFound) {
        storedUser = { id: seedFound.id, role: seedFound.role };
      }
    }

    if (!storedUser) {
      throw new UnauthorizedException(
        `User with ID "${trimmedUserId}" was not found. Please provide a valid user UUID.`,
      );
    }

    // If x-user-role was provided, verify it strictly matches the stored record
    if (userRole) {
      const normalizedRole = userRole.trim().toUpperCase() as Role;
      if (!Object.values(Role).includes(normalizedRole)) {
        throw new UnauthorizedException(
          `Invalid "x-user-role" header "${userRole}". Allowed values: ${Object.values(Role).join(', ')}.`,
        );
      }

      if (normalizedRole !== storedUser.role) {
        throw new UnauthorizedException(
          `Role mismatch: User "${trimmedUserId}" has role "${storedUser.role}", but claimed "${normalizedRole}". Privilege escalation is forbidden.`,
        );
      }
    }

    const user: AuthenticatedUser = {
      id: storedUser.id,
      role: storedUser.role,
    };

    request.user = user;
    return true;
  }
}
