import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { RequestStatus } from '../../common/enums/request-status.enum';

export class ListRequestsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @IsOptional()
  @IsEnum(RequestStatus, {
    message: `status must be one of: ${Object.values(RequestStatus).join(', ')}`,
  })
  status?: RequestStatus;

  @IsOptional()
  @IsUUID('all', { message: 'assignedAgentId must be a valid UUID' })
  assignedAgentId?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  search?: string;
}
