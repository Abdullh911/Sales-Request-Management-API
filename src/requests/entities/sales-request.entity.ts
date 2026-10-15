import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RequestStatus } from '../../common/enums/request-status.enum';
import { User } from '../../users/entities/user.entity';
import { ActivityLog } from './activity-log.entity';

@Entity('sales_requests')
export class SalesRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ name: 'external_id', type: 'varchar', length: 150, unique: true })
  externalId: string;

  @Column({ name: 'customer_name', type: 'varchar', length: 150 })
  customerName: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'text' })
  description: string;

  @Index()
  @Column({
    type: 'enum',
    enum: RequestStatus,
    default: RequestStatus.NEW,
  })
  status: RequestStatus;

  @Index()
  @Column({ name: 'assigned_agent_id', type: 'uuid', nullable: true })
  assignedAgentId: string | null;

  @ManyToOne(() => User, (user) => user.assignedRequests, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'assigned_agent_id' })
  assignedAgent: User | null;

  @OneToMany(() => ActivityLog, (activity) => activity.request, {
    cascade: false,
  })
  activities: ActivityLog[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
