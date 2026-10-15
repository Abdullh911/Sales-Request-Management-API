import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ActivityType } from '../../common/enums/activity-type.enum';
import { SalesRequest } from './sales-request.entity';

@Entity('request_activities')
export class ActivityLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'request_id', type: 'uuid' })
  requestId: string;

  @ManyToOne(() => SalesRequest, (request) => request.activities, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'request_id' })
  request: SalesRequest;

  @Column({
    type: 'enum',
    enum: ActivityType,
  })
  type: ActivityType;

  @Column({ name: 'previous_value', type: 'varchar', length: 150, nullable: true })
  previousValue: string | null;

  @Column({ name: 'new_value', type: 'varchar', length: 150 })
  newValue: string;

  @Column({ name: 'performed_by_id', type: 'varchar', length: 100, nullable: true })
  performedById: string | null;

  @Column({ type: 'text' })
  description: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
