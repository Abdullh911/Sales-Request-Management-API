import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { ActivityLog } from './entities/activity-log.entity';
import { SalesRequest } from './entities/sales-request.entity';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([SalesRequest, ActivityLog]),
    UsersModule,
  ],
  controllers: [WebhooksController, RequestsController],
  providers: [RequestsService],
  exports: [RequestsService],
})
export class RequestsModule {}
