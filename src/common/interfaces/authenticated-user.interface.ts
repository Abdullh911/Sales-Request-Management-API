import { Role } from '../enums/role.enum';

export interface AuthenticatedUser {
  id: string;
  role: Role;
  name?: string;
  email?: string;
}
