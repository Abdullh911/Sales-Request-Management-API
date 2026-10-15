import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { User } from './entities/user.entity';

export const DEFAULT_SEED_USERS: Array<Pick<User, 'id' | 'name' | 'email' | 'role'>> = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Alice Admin',
    email: 'admin@company.example.com',
    role: Role.ADMIN,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Bob Agent',
    email: 'bob.agent@company.example.com',
    role: Role.AGENT,
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Carol Agent',
    email: 'carol.agent@company.example.com',
    role: Role.AGENT,
  },
];

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaultUsers();
  }

  async seedDefaultUsers(): Promise<void> {
    for (const seedUser of DEFAULT_SEED_USERS) {
      const existing = await this.usersRepository.findOne({
        where: [{ id: seedUser.id }, { email: seedUser.email }],
      });
      if (!existing) {
        await this.usersRepository.save(this.usersRepository.create(seedUser));
        this.logger.log(`Seeded mock user: ${seedUser.name} (${seedUser.role}) [${seedUser.id}]`);
      }
    }
  }

  async findAll(): Promise<User[]> {
    return this.usersRepository.find({
      order: { role: 'ASC', name: 'ASC' },
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }
}
