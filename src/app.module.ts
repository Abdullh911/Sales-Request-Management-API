import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { MockAuthGuard } from './common/guards/mock-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { ActivityLog } from './requests/entities/activity-log.entity';
import { SalesRequest } from './requests/entities/sales-request.entity';
import { RequestsModule } from './requests/requests.module';
import { User } from './users/entities/user.entity';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get<string>('DB_USERNAME', 'postgres'),
        password: configService.get<string>('DB_PASSWORD', 'postgres'),
        database: configService.get<string>('DB_DATABASE', 'sales_requests'),
        entities: [User, SalesRequest, ActivityLog],
        synchronize: configService.get<string>('DB_SYNCHRONIZE', 'true') === 'true',
      }),
    }),
    UsersModule,
    RequestsModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_GUARD,
      useClass: MockAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
