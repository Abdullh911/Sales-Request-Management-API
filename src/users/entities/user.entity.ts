import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../../common/enums/role.enum';
import { SalesRequest } from '../../requests/entities/sales-request.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({
    type: 'enum',
    enum: Role,
    default: Role.AGENT,
  })
  role: Role;

  @OneToMany(() => SalesRequest, (request) => request.assignedAgent)
  assignedRequests: SalesRequest[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
