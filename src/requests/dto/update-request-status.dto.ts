import { IsEnum, IsNotEmpty } from 'class-validator';
import { RequestStatus } from '../../common/enums/request-status.enum';

export class UpdateRequestStatusDto {
  @IsEnum(RequestStatus, {
    message: `status must be one of: ${Object.values(RequestStatus).join(', ')}`,
  })
  @IsNotEmpty({ message: 'status is required' })
  status: RequestStatus;
}
