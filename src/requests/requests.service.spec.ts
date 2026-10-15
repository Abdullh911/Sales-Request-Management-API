import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ActivityType } from '../common/enums/activity-type.enum';
import { RequestStatus } from '../common/enums/request-status.enum';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { User } from '../users/entities/user.entity';
import { ActivityLog } from './entities/activity-log.entity';
import { SalesRequest } from './entities/sales-request.entity';
import { RequestsService } from './requests.service';

describe('RequestsService', () => {
  let service: RequestsService;

  const adminUser: AuthenticatedUser = {
    id: '11111111-1111-4111-8111-111111111111',
    role: Role.ADMIN,
  };

  const agentOne: AuthenticatedUser = {
    id: '22222222-2222-4222-8222-222222222222',
    role: Role.AGENT,
  };

  const agentTwo: AuthenticatedUser = {
    id: '33333333-3333-4333-8333-333333333333',
    role: Role.AGENT,
  };

  const mockRequestsRepo = {
    findOne: jest.fn(),
    create: jest.fn((dto) => dto),
    save: jest.fn((entity) => Promise.resolve({ id: 'req-uuid-1', ...entity })),
    createQueryBuilder: jest.fn(),
  };

  const mockActivitiesRepo = {
    create: jest.fn((dto) => dto),
    save: jest.fn((entity) => Promise.resolve({ id: 'act-uuid-1', ...entity })),
    find: jest.fn(),
  };

  const mockUsersRepo = {
    findOne: jest.fn(),
    create: jest.fn((dto) => dto),
    save: jest.fn((entity) => Promise.resolve(entity)),
  };

  const mockDataSource = {
    transaction: jest.fn(async (cb) =>
      cb({
        getRepository: (entity: unknown) => {
          if (entity === SalesRequest) return mockRequestsRepo;
          if (entity === ActivityLog) return mockActivitiesRepo;
          return mockUsersRepo;
        },
      }),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequestsService,
        { provide: getRepositoryToken(SalesRequest), useValue: mockRequestsRepo },
        { provide: getRepositoryToken(ActivityLog), useValue: mockActivitiesRepo },
        { provide: getRepositoryToken(User), useValue: mockUsersRepo },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<RequestsService>(RequestsService);
  });

  describe('1. Webhook Request Creation & Deduplication', () => {
    it('should create a new sales request with status NEW and record a CREATED activity log', async () => {
      mockRequestsRepo.findOne.mockResolvedValueOnce(null);

      const dto = {
        externalId: 'EXT-1001',
        customerName: 'Acme Corp',
        email: 'contact@acme.com',
        description: 'Interested in 50 enterprise seats',
      };

      const result = await service.createFromWebhook(dto);

      expect(result.externalId).toBe('EXT-1001');
      expect(result.status).toBe(RequestStatus.NEW);
      expect(result.assignedAgentId).toBeNull();
      expect(mockActivitiesRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ActivityType.CREATED,
          previousValue: null,
          newValue: RequestStatus.NEW,
        }),
      );
    });

    it('should reject duplicate externalId with ConflictException (409)', async () => {
      mockRequestsRepo.findOne.mockResolvedValueOnce({
        id: 'req-uuid-1',
        externalId: 'EXT-1001',
      });

      await expect(
        service.createFromWebhook({
          externalId: 'EXT-1001',
          customerName: 'Acme Corp',
          email: 'contact@acme.com',
          description: 'Duplicate webhook delivery',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('2. Agent Assignment & Role Enforcement', () => {
    it('should allow Admin to assign a request to an Agent and log an ASSIGNED activity', async () => {
      const existingRequest: Partial<SalesRequest> = {
        id: 'req-uuid-1',
        externalId: 'EXT-1001',
        status: RequestStatus.NEW,
        assignedAgentId: null,
      };

      mockRequestsRepo.findOne.mockResolvedValueOnce(existingRequest);
      mockUsersRepo.findOne.mockResolvedValueOnce({
        id: agentOne.id,
        name: 'Bob Agent',
        role: Role.AGENT,
      });

      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          ...existingRequest,
          assignedAgentId: agentOne.id,
        }),
      };
      mockRequestsRepo.createQueryBuilder.mockReturnValueOnce(mockQb);

      const result = await service.assignAgent(
        'req-uuid-1',
        { agentId: agentOne.id },
        adminUser,
      );

      expect(result.assignedAgentId).toBe(agentOne.id);
      expect(mockActivitiesRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req-uuid-1',
          type: ActivityType.ASSIGNED,
          previousValue: null,
          newValue: agentOne.id,
          performedById: adminUser.id,
        }),
      );
    });

    it('should forbid an Agent from assigning a request', async () => {
      await expect(
        service.assignAgent('req-uuid-1', { agentId: agentOne.id }, agentOne),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if assigned agent does not exist', async () => {
      const existingRequest: Partial<SalesRequest> = {
        id: 'req-uuid-1',
        status: RequestStatus.NEW,
      };
      mockRequestsRepo.findOne.mockResolvedValueOnce(existingRequest);
      mockUsersRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.assignAgent('req-uuid-1', { agentId: 'non-existent-agent' }, adminUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('should allow Admin to assign a CLOSED request', async () => {
      const closedRequest: Partial<SalesRequest> = {
        id: 'req-uuid-1',
        status: RequestStatus.CLOSED,
        assignedAgentId: null,
      };

      mockRequestsRepo.findOne.mockResolvedValueOnce(closedRequest);
      mockUsersRepo.findOne.mockResolvedValueOnce({
        id: agentOne.id,
        name: 'Bob Agent',
        role: Role.AGENT,
      });

      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          ...closedRequest,
          assignedAgentId: agentOne.id,
        }),
      };
      mockRequestsRepo.createQueryBuilder.mockReturnValueOnce(mockQb);

      const result = await service.assignAgent(
        'req-uuid-1',
        { agentId: agentOne.id },
        adminUser,
      );

      expect(result.assignedAgentId).toBe(agentOne.id);
    });
  });

  describe('3. Status Progression (NEW -> CONTACTED -> QUALIFIED -> CLOSED) & Permissions', () => {
    it('should allow valid forward status transitions and record STATUS_CHANGED activity', async () => {
      const existingRequest: Partial<SalesRequest> = {
        id: 'req-uuid-1',
        status: RequestStatus.NEW,
        assignedAgentId: agentOne.id,
      };

      mockRequestsRepo.findOne.mockResolvedValueOnce(existingRequest);

      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          ...existingRequest,
          status: RequestStatus.CONTACTED,
        }),
      };
      mockRequestsRepo.createQueryBuilder.mockReturnValueOnce(mockQb);

      const updated = await service.updateStatus(
        'req-uuid-1',
        { status: RequestStatus.CONTACTED },
        agentOne,
      );

      expect(updated.status).toBe(RequestStatus.CONTACTED);
      expect(mockActivitiesRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ActivityType.STATUS_CHANGED,
          previousValue: RequestStatus.NEW,
          newValue: RequestStatus.CONTACTED,
          performedById: agentOne.id,
        }),
      );
    });

    it('should reject invalid status jumps (e.g., NEW -> QUALIFIED) with BadRequestException', async () => {
      mockRequestsRepo.findOne.mockResolvedValueOnce({
        id: 'req-uuid-1',
        status: RequestStatus.NEW,
        assignedAgentId: agentOne.id,
      });

      await expect(
        service.updateStatus(
          'req-uuid-1',
          { status: RequestStatus.QUALIFIED },
          agentOne,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject backward transitions (e.g., CLOSED -> QUALIFIED) with BadRequestException', async () => {
      mockRequestsRepo.findOne.mockResolvedValueOnce({
        id: 'req-uuid-1',
        status: RequestStatus.CLOSED,
        assignedAgentId: agentOne.id,
      });

      await expect(
        service.updateStatus(
          'req-uuid-1',
          { status: RequestStatus.QUALIFIED },
          adminUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should forbid an Agent from updating or viewing a request assigned to another agent', async () => {
      mockRequestsRepo.findOne.mockResolvedValueOnce({
        id: 'req-uuid-1',
        status: RequestStatus.NEW,
        assignedAgentId: agentOne.id,
      });

      await expect(
        service.updateStatus(
          'req-uuid-1',
          { status: RequestStatus.CONTACTED },
          agentTwo,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('4. Pagination & Role-Based Filtering', () => {
    it('should automatically scope Agent list queries to their own user ID', async () => {
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      mockRequestsRepo.createQueryBuilder.mockReturnValueOnce(mockQb);

      const res = await service.findAll(
        { page: 1, limit: 10, status: RequestStatus.NEW },
        agentOne,
      );

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'request.assignedAgentId = :agentId',
        { agentId: agentOne.id },
      );
      expect(res.meta).toEqual({
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('should throw NotFoundException when getting a non-existent request', async () => {
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      mockRequestsRepo.createQueryBuilder.mockReturnValueOnce(mockQb);

      await expect(
        service.findOne('99999999-9999-4999-8999-999999999999', adminUser),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
