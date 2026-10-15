import { IsNotEmpty, IsUUID } from 'class-validator';

export class AssignRequestDto {
  @IsUUID('all', { message: 'agentId must be a valid UUID' })
  @IsNotEmpty({ message: 'agentId is required' })
  agentId: string;
}
