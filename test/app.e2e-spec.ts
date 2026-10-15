import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { RequestStatus } from '../src/common/enums/request-status.enum';
import { Role } from '../src/common/enums/role.enum';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { MockAuthGuard } from '../src/common/guards/mock-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { RequestsController } from '../src/requests/requests.controller';
import { RequestsService } from '../src/requests/requests.service';
import { WebhooksController } from '../src/requests/webhooks.controller';
import { ConfigService } from '@nestjs/config';

describe('Sales Request Management API (e2e controller + guard + validation pipeline)', () => {
  let app: INestApplication;

  const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
  const AGENT_ID = '22222222-2222-4222-8222-222222222222';
  const REQ_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const mockRequestsService = {
    createFromWebhook: jest.fn(async (dto) => ({
      id: REQ_ID,
      ...dto,
      status: RequestStatus.NEW,
      assignedAgentId: null,
    })),
    findAll: jest.fn(async () => ({
      data: [],
      meta: { total: 0, page: 1, limit: 10, totalPages: 1 },
    })),
    findOne: jest.fn(async (id) => ({
      id,
      externalId: 'EXT-900',
      status: RequestStatus.NEW,
      assignedAgentId: AGENT_ID,
      activities: [],
    })),
    assignAgent: jest.fn(async (id, dto) => ({
      id,
      assignedAgentId: dto.agentId,
      status: RequestStatus.NEW,
    })),
    updateStatus: jest.fn(async (id, dto) => ({
      id,
      status: dto.status,
      assignedAgentId: AGENT_ID,
    })),
    getActivities: jest.fn(async () => []),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController, RequestsController],
      providers: [
        { provide: RequestsService, useValue: mockRequestsService },
        { provide: ConfigService, useValue: { get: jest.fn(() => '') } },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        { provide: APP_GUARD, useClass: MockAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /webhooks/requests -> creates request without needing auth headers (201)', async () => {
    const res = await request(app.getHttpServer())
      .post('/webhooks/requests')
      .send({
        externalId: 'EXT-900',
        customerName: 'Jane Customer',
        email: 'jane@example.com',
        description: 'Need enterprise pricing quote',
      })
      .expect(201);

    expect(res.body.externalId).toBe('EXT-900');
    expect(res.body.status).toBe(RequestStatus.NEW);
  });

  it('POST /webhooks/requests -> rejects invalid email payload (400)', async () => {
    await request(app.getHttpServer())
      .post('/webhooks/requests')
      .send({
        externalId: 'EXT-901',
        customerName: 'Jane Customer',
        email: 'invalid-email',
        description: 'Need enterprise pricing quote',
      })
      .expect(400);
  });

  it('GET /requests -> rejects unauthenticated request (401)', async () => {
    await request(app.getHttpServer()).get('/requests').expect(401);
  });

  it('PATCH /requests/:id/assign -> forbids AGENT role from assigning requests (403)', async () => {
    await request(app.getHttpServer())
      .patch(`/requests/${REQ_ID}/assign`)
      .set('x-user-id', AGENT_ID)
      .set('x-user-role', Role.AGENT)
      .send({ agentId: AGENT_ID })
      .expect(403);
  });

  it('PATCH /requests/:id/assign -> allows ADMIN role to assign requests (200)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/requests/${REQ_ID}/assign`)
      .set('x-user-id', ADMIN_ID)
      .set('x-user-role', Role.ADMIN)
      .send({ agentId: AGENT_ID })
      .expect(200);

    expect(res.body.assignedAgentId).toBe(AGENT_ID);
  });
});
