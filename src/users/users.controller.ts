import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Lists seeded mock users (Admin and Agents) so testers can easily grab UUIDs.
   */
  @Public()
  @Get()
  async findAll(): Promise<User[]> {
    return this.usersService.findAll();
  }
}
