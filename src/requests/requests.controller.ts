import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { AssignRequestDto } from './dto/assign-request.dto';
import { ListRequestsQueryDto } from './dto/list-requests-query.dto';
import { UpdateRequestStatusDto } from './dto/update-request-status.dto';
import { ActivityLog } from './entities/activity-log.entity';
import { SalesRequest } from './entities/sales-request.entity';
import { PaginatedRequestsResult, RequestsService } from './requests.service';

@Controller('requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  /**
   * Requirement 2a: List requests with pagination and filtering.
   * Admins see all requests; Agents see only requests assigned to them.
   */
  @Get()
  async findAll(
    @Query() query: ListRequestsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedRequestsResult> {
    return this.requestsService.findAll(query, user);
  }

  /**
   * Requirement 2b: Get request details (includes assigned agent and activity history).
   */
  @Get(':id')
  async findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SalesRequest> {
    return this.requestsService.findOne(id, user);
  }

  /**
   * Requirement 2c: Assign a request to an agent (Admin only).
   * Supports both PATCH and POST for convenience.
   */
  @Patch(':id/assign')
  @Roles(Role.ADMIN)
  async assignAgent(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AssignRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SalesRequest> {
    return this.requestsService.assignAgent(id, dto, user);
  }

  @Post(':id/assign')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN)
  async assignAgentPostAlias(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AssignRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SalesRequest> {
    return this.requestsService.assignAgent(id, dto, user);
  }

  /**
   * Requirement 2d: Update request status (NEW -> CONTACTED -> QUALIFIED -> CLOSED).
   * Supports both PATCH and PUT for convenience.
   */
  @Patch(':id/status')
  async updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateRequestStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SalesRequest> {
    return this.requestsService.updateStatus(id, dto, user);
  }

  @Put(':id/status')
  async updateStatusPutAlias(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateRequestStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SalesRequest> {
    return this.requestsService.updateStatus(id, dto, user);
  }

  /**
   * Requirement 4: Get activity history for a request.
   */
  @Get(':id/activities')
  async getActivities(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ActivityLog[]> {
    return this.requestsService.getActivities(id, user);
  }
}
