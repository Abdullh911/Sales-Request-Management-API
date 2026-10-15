import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ActivityType } from '../common/enums/activity-type.enum';
import {
  ALLOWED_STATUS_TRANSITIONS,
  RequestStatus,
} from '../common/enums/request-status.enum';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { User } from '../users/entities/user.entity';
import { AssignRequestDto } from './dto/assign-request.dto';
import { CreateWebhookRequestDto } from './dto/create-webhook-request.dto';
import { ListRequestsQueryDto } from './dto/list-requests-query.dto';
import { UpdateRequestStatusDto } from './dto/update-request-status.dto';
import { ActivityLog } from './entities/activity-log.entity';
import { SalesRequest } from './entities/sales-request.entity';

export interface PaginatedRequestsResult {
  data: SalesRequest[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

@Injectable()
export class RequestsService {
  constructor(
    @InjectRepository(SalesRequest)
    private readonly requestsRepository: Repository<SalesRequest>,
    @InjectRepository(ActivityLog)
    private readonly activitiesRepository: Repository<ActivityLog>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 1. Receive a sales request from an external webhook.
   * Prevents duplicate requests with the same `externalId` at both application
   * and PostgreSQL unique-constraint levels.
   */
  async createFromWebhook(dto: CreateWebhookRequestDto): Promise<SalesRequest> {
    const existing = await this.requestsRepository.findOne({
      where: { externalId: dto.externalId },
    });

    if (existing) {
      throw new ConflictException(
        `Sales request with externalId "${dto.externalId}" already exists.`,
      );
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        const requestRepo = manager.getRepository(SalesRequest);
        const activityRepo = manager.getRepository(ActivityLog);

        const newRequest = requestRepo.create({
          externalId: dto.externalId,
          customerName: dto.customerName,
          email: dto.email,
          description: dto.description,
          status: RequestStatus.NEW,
          assignedAgentId: null,
        });

        const savedRequest = await requestRepo.save(newRequest);

        const initialActivity = activityRepo.create({
          requestId: savedRequest.id,
          type: ActivityType.CREATED,
          previousValue: null,
          newValue: RequestStatus.NEW,
          performedById: 'EXTERNAL_WEBHOOK',
          description: `Sales request created via external webhook (externalId: ${savedRequest.externalId}) with status ${RequestStatus.NEW}.`,
        });

        await activityRepo.save(initialActivity);

        return savedRequest;
      });
    } catch (error: unknown) {
      // Handle concurrent race condition resulting in Postgres unique constraint violation (23505)
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === '23505'
      ) {
        throw new ConflictException(
          `Sales request with externalId "${dto.externalId}" already exists.`,
        );
      }
      throw error;
    }
  }

  /**
   * 2a. List requests with pagination and filtering.
   * - Admins can view all requests and filter by `assignedAgentId`.
   * - Agents are strictly scoped to requests assigned to them (`assignedAgentId = user.id`).
   */
  async findAll(
    query: ListRequestsQueryDto,
    user: AuthenticatedUser,
  ): Promise<PaginatedRequestsResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const qb = this.requestsRepository
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.assignedAgent', 'assignedAgent')
      .orderBy('request.createdAt', 'DESC');

    if (user.role === Role.AGENT) {
      qb.andWhere('request.assignedAgentId = :agentId', { agentId: user.id });
    } else if (query.assignedAgentId) {
      qb.andWhere('request.assignedAgentId = :assignedAgentId', {
        assignedAgentId: query.assignedAgentId,
      });
    }

    if (query.status) {
      qb.andWhere('request.status = :status', { status: query.status });
    }

    if (query.search) {
      qb.andWhere(
        '(request.customerName ILIKE :search OR request.email ILIKE :search OR request.externalId ILIKE :search OR request.description ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * 2b. Get single request details including activity history.
   * - Admins can view any request.
   * - Agents can only view requests assigned to them.
   */
  async findOne(id: string, user: AuthenticatedUser): Promise<SalesRequest> {
    const request = await this.requestsRepository
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.assignedAgent', 'assignedAgent')
      .leftJoinAndSelect('request.activities', 'activities')
      .where('request.id = :id', { id })
      .orderBy('activities.createdAt', 'ASC')
      .getOne();

    if (!request) {
      throw new NotFoundException(`Sales request with ID "${id}" not found.`);
    }

    this.assertAccessPermission(request, user);

    return request;
  }

  /**
   * 2c. Assign a request to an agent (Admin only).
   * Logs an `ASSIGNED` activity history entry.
   */
  async assignAgent(
    id: string,
    dto: AssignRequestDto,
    user: AuthenticatedUser,
  ): Promise<SalesRequest> {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only Admins can assign requests to agents.');
    }

    const request = await this.requestsRepository.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException(`Sales request with ID "${id}" not found.`);
    }

    if (request.status === RequestStatus.CLOSED) {
      throw new BadRequestException(
        'Cannot reassign a sales request that is already CLOSED.',
      );
    }

    let agent = await this.usersRepository.findOne({
      where: { id: dto.agentId },
    });

    if (agent && agent.role !== Role.AGENT) {
      throw new BadRequestException(
        `User "${agent.name}" (${dto.agentId}) has role ${agent.role} and is not an AGENT.`,
      );
    }

    if (!agent) {
      agent = await this.usersRepository.save(
        this.usersRepository.create({
          id: dto.agentId,
          name: `Agent ${dto.agentId.slice(0, 8)}`,
          email: `agent-${dto.agentId.slice(0, 8)}@company.example.com`,
          role: Role.AGENT,
        }),
      );
    }

    const previousAgentId = request.assignedAgentId;
    if (previousAgentId === dto.agentId) {
      return this.findOne(id, user);
    }

    await this.dataSource.transaction(async (manager) => {
      const requestRepo = manager.getRepository(SalesRequest);
      const activityRepo = manager.getRepository(ActivityLog);

      request.assignedAgentId = dto.agentId;
      request.assignedAgent = agent;
      await requestRepo.save(request);

      const activity = activityRepo.create({
        requestId: request.id,
        type: ActivityType.ASSIGNED,
        previousValue: previousAgentId,
        newValue: dto.agentId,
        performedById: user.id,
        description: previousAgentId
          ? `Request reassigned from agent ${previousAgentId} to ${agent.name} (${dto.agentId}).`
          : `Request assigned to agent ${agent.name} (${dto.agentId}).`,
      });

      await activityRepo.save(activity);
    });

    return this.findOne(id, user);
  }

  /**
   * 2d. Update request status following strict forward progression:
   * NEW -> CONTACTED -> QUALIFIED -> CLOSED
   * - Admins can update any request.
   * - Agents can only update requests assigned to them.
   * - Logs a `STATUS_CHANGED` activity history entry.
   */
  async updateStatus(
    id: string,
    dto: UpdateRequestStatusDto,
    user: AuthenticatedUser,
  ): Promise<SalesRequest> {
    const request = await this.requestsRepository.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException(`Sales request with ID "${id}" not found.`);
    }

    this.assertAccessPermission(request, user);

    const currentStatus = request.status;
    const targetStatus = dto.status;
    const expectedNextStatus = ALLOWED_STATUS_TRANSITIONS[currentStatus];

    if (expectedNextStatus !== targetStatus) {
      const allowedText = expectedNextStatus
        ? `Allowed next status from ${currentStatus} is ${expectedNextStatus}.`
        : `Request is already ${RequestStatus.CLOSED} and cannot transition further.`;
      throw new BadRequestException(
        `Invalid status transition from ${currentStatus} to ${targetStatus}. ${allowedText}`,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      const requestRepo = manager.getRepository(SalesRequest);
      const activityRepo = manager.getRepository(ActivityLog);

      request.status = targetStatus;
      await requestRepo.save(request);

      const activity = activityRepo.create({
        requestId: request.id,
        type: ActivityType.STATUS_CHANGED,
        previousValue: currentStatus,
        newValue: targetStatus,
        performedById: user.id,
        description: `Status updated from ${currentStatus} to ${targetStatus} by ${user.role} (${user.id}).`,
      });

      await activityRepo.save(activity);
    });

    return this.findOne(id, user);
  }

  /**
   * 4. Get activity history for a specific request.
   */
  async getActivities(
    id: string,
    user: AuthenticatedUser,
  ): Promise<ActivityLog[]> {
    const request = await this.requestsRepository.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException(`Sales request with ID "${id}" not found.`);
    }

    this.assertAccessPermission(request, user);

    return this.activitiesRepository.find({
      where: { requestId: id },
      order: { createdAt: 'ASC' },
    });
  }

  private assertAccessPermission(
    request: SalesRequest,
    user: AuthenticatedUser,
  ): void {
    if (user.role === Role.ADMIN) {
      return;
    }

    if (request.assignedAgentId !== user.id) {
      throw new ForbiddenException(
        'Agents can only view or update sales requests assigned to them.',
      );
    }
  }
}
