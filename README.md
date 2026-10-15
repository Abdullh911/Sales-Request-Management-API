# Sales Request Management API

A clean, production-ready **Sales Request Management API** built with **NestJS**, **TypeScript**, **PostgreSQL**, and **TypeORM**.

## Features Implemented

1. **Idempotent External Webhook (`POST /webhooks/requests`)**
   - Receives incoming sales requests with `externalId`, `customerName`, `email`, and `description`.
   - Prevents duplicate creation using both an application-level check and a PostgreSQL `UNIQUE` index on `external_id` (including race-condition handling for PostgreSQL error `23505`, returning `409 Conflict`).
   - Atomically creates the request with initial status `NEW` and logs a `CREATED` entry in the activity history.
2. **Request Management APIs (`/requests`)**
   - **List with Pagination & Filtering (`GET /requests`)**: Supports `page`, `limit`, `status`, `assignedAgentId`, and `search` (case-insensitive search across customer name, email, external ID, and description).
   - **Get Request Details (`GET /requests/:id`)**: Returns full request details, assigned agent metadata, and ordered activity history.
   - **Assign Request to Agent (`PATCH /requests/:id/assign`)**: Restricted to `ADMIN`. Assigns or reassigns a request to an agent and records an `ASSIGNED` activity log.
   - **Update Request Status (`PATCH /requests/:id/status`)**: Enforces strict forward-only state machine transitions (`NEW -> CONTACTED -> QUALIFIED -> CLOSED`) and records a `STATUS_CHANGED` activity log.
3. **Role-Based Access Control (Admin & Agent) + Simple Mock Auth**
   - Uses lightweight HTTP headers (`x-user-id` and `x-user-role`) via `MockAuthGuard` and `RolesGuard`.
   - **Admin (`ADMIN`)**: Can view, filter, assign, and update all sales requests.
   - **Agent (`AGENT`)**: Automatically scoped to view and update **only** requests assigned to their `x-user-id`. Attempting to access or update another agent's or unassigned request returns `403 Forbidden`; attempting to assign a request returns `403 Forbidden`.
4. **Transactional Activity History (`GET /requests/:id` & `GET /requests/:id/activities`)**
   - Every creation, agent assignment, and status transition is persisted inside a database transaction alongside its `ActivityLog` record (`CREATED`, `ASSIGNED`, `STATUS_CHANGED`).

## Project Structure

```text
src/
├── common/
│   ├── decorators/       # @Public(), @Roles(), @CurrentUser()
│   ├── enums/            # Role, RequestStatus (+ transition map), ActivityType
│   ├── filters/          # Global AllExceptionsFilter for consistent JSON errors
│   ├── guards/           # MockAuthGuard & RolesGuard (+ unit tests)
│   └── interfaces/       # AuthenticatedUser interface
├── requests/
│   ├── dto/              # Validated DTOs (webhook, query/filter, assign, status)
│   ├── entities/         # SalesRequest & ActivityLog TypeORM entities
│   ├── requests.controller.ts
│   ├── webhooks.controller.ts
│   ├── requests.service.ts
│   ├── requests.service.spec.ts
│   └── requests.module.ts
├── users/
│   ├── entities/         # User entity
│   ├── users.controller.ts
│   ├── users.service.ts  # Seeds default Admin & Agent accounts on startup
│   └── users.module.ts
├── app.module.ts
└── main.ts
test/
└── app.e2e-spec.ts       # E2E pipeline tests (DTO validation, guards, RBAC)
```

## Quick Start

### Prerequisites

- **Node.js** >= 18
- **Docker & Docker Compose** (or a local PostgreSQL instance)

### 1. Clone & Install Dependencies

```bash
npm install
cp .env.example .env
```

### 2. Start PostgreSQL via Docker Compose

```bash
docker compose up -d
```

### 3. Run the Application

```bash
# Development mode (watch)
npm run start:dev

# Production build
npm run build
npm run start:prod
```

The API listens on `http://localhost:3000` by default.

### 4. Run Tests

```bash
# Unit tests (Service logic, deduplication, state transitions, RBAC, guards)
npm test

# End-to-end controller + validation + guard pipeline tests
npm run test:e2e
```

## Mock Authentication & Seeded Users

Protected endpoints expect two headers:

| Header | Description | Allowed Values |
| :--- | :--- | :--- |
| `x-user-id` | UUID of the calling user | Any valid UUID |
| `x-user-role` | Role of the calling user | `ADMIN` or `AGENT` |

On startup, the application automatically seeds three users (viewable anytime via `GET /users`):

| Name | Role | `x-user-id` |
| :--- | :--- | :--- |
| **Alice Admin** | `ADMIN` | `11111111-1111-4111-8111-111111111111` |
| **Bob Agent** | `AGENT` | `22222222-2222-4222-8222-222222222222` |
| **Carol Agent** | `AGENT` | `33333333-3333-4333-8333-333333333333` |

## API Reference & `curl` Examples

### 1. Receive External Request (Webhook)

- **Endpoint**: `POST /webhooks/requests`
- **Auth**: Public (no `x-user-id` / `x-user-role` required; optional `x-webhook-secret` if `WEBHOOK_SECRET` is set in `.env`)

```bash
curl -X POST http://localhost:3000/webhooks/requests \
  -H "Content-Type: application/json" \
  -d '{
    "externalId": "EXT-2026-001",
    "customerName": "Acme Corporation",
    "email": "purchasing@acme.com",
    "description": "Looking for an enterprise annual plan for 120 users."
  }'
```

- **Duplicate Request Behavior**: Calling the endpoint again with `"externalId": "EXT-2026-001"` returns `409 Conflict`.

### 2. List Requests (Pagination & Filtering)

- **Endpoint**: `GET /requests?page=1&limit=10&status=NEW&search=Acme`
- **Admin Example** (views all requests, can also filter by `assignedAgentId`):

```bash
curl -X GET "http://localhost:3000/requests?page=1&limit=10&status=NEW" \
  -H "x-user-id: 11111111-1111-4111-8111-111111111111" \
  -H "x-user-role: ADMIN"
```

- **Agent Example** (automatically filtered to requests assigned to Bob Agent):

```bash
curl -X GET "http://localhost:3000/requests?page=1&limit=10" \
  -H "x-user-id: 22222222-2222-4222-8222-222222222222" \
  -H "x-user-role: AGENT"
```

### 3. Assign Request to an Agent (Admin Only)

- **Endpoint**: `PATCH /requests/:id/assign`

```bash
curl -X PATCH http://localhost:3000/requests/<REQUEST_UUID>/assign \
  -H "Content-Type: application/json" \
  -H "x-user-id: 11111111-1111-4111-8111-111111111111" \
  -H "x-user-role: ADMIN" \
  -d '{
    "agentId": "22222222-2222-4222-8222-222222222222"
  }'
```

### 4. Update Request Status (`NEW -> CONTACTED -> QUALIFIED -> CLOSED`)

- **Endpoint**: `PATCH /requests/:id/status`
- **Allowed by**: `ADMIN` (any request) or `AGENT` (only if assigned to them).

```bash
curl -X PATCH http://localhost:3000/requests/<REQUEST_UUID>/status \
  -H "Content-Type: application/json" \
  -H "x-user-id: 22222222-2222-4222-8222-222222222222" \
  -H "x-user-role: AGENT" \
  -d '{
    "status": "CONTACTED"
  }'
```

- **State Transition Rules**:
  - `NEW` -> `CONTACTED`
  - `CONTACTED` -> `QUALIFIED`
  - `QUALIFIED` -> `CLOSED`
  - Any skipped or backward step returns `400 Bad Request`.

### 5. Get Request Details & Activity History

- **Endpoint**: `GET /requests/:id` (or `GET /requests/:id/activities` for logs only)

```bash
curl -X GET http://localhost:3000/requests/<REQUEST_UUID> \
  -H "x-user-id: 22222222-2222-4222-8222-222222222222" \
  -H "x-user-role: AGENT"
```
