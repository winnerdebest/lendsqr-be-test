# AGENTS.md — Lendsqr Wallet Service (`lendsqr-be-test`)

> **Single Source of Truth for AI Agents & Engineers**
> Every agent working on this workspace MUST read and follow this document before editing code, running migrations, or committing.

---

## 1. Project Context & Assessment Rules

- **Candidate**: Winner OrluVictor (`winner <winnerbrown9@gmail.com>`)
- **Repository**: `https://github.com/winnerdebest/lendsqr-be-test` (Public)
- **Target Live Render URL**: `https://winner-orluvictor-lendsqr-be-test.onrender.com`
- **Role**: Full-Stack / DevOps Engineer Assessment at Lendsqr
- **Two-Stage Evaluation**:
  - **Stage 1 (Take-Home)**: Scored on code quality, data integrity & concurrency, transaction safety (idempotency), security & edge cases, database design, API design, unit/integration testing, and repository quality (README + ERD + commit history).
  - **Stage 2 (Live Extension)**: 30–45 min live screen-share where Winner modifies this codebase in real time. **Keep the architecture clean, explicit, and free of "magic" abstractions so live modifications take minutes.**

> **IMPORTANT GIT RULE**: Never push to GitHub without the user's explicit permission. Commit incrementally using meaningful Conventional Commits (`chore:`, `feat:`, `test:`, `ci:`, `docs:`). Never dump everything in a single commit.

---

## 2. Tech Stack & Architecture

| Layer | Technology | Rationale |
|---|---|---|
| **Runtime & Language** | Node.js (22+ LTS) + TypeScript (`strict: true`) | Mandatory per assessment brief. |
| **HTTP Framework** | Express.js | Clean, explicit layered architecture (`routes -> controller -> service -> repository`), zero decorator magic, fast to extend in Stage 2. |
| **Database** | PostgreSQL | Production-grade ACID transactions, `SELECT ... FOR UPDATE` pessimistic row locks, `CHECK` constraints. |
| **Query Builder & Migrations** | Knex.js (`pg`) | Explicit SQL visibility for transactions and row-level locking (`forUpdate()`). |
| **Validation** | Zod | Single source of truth for request validation + TypeScript inference. |
| **Authentication** | JWT (`jsonwebtoken` + `bcryptjs`) for users; `x-admin-key` header for admin routes | Clean separation between customer actions and admin back-office actions. |
| **External Integrations** | 1. **Lendsqr Adjutor Karma API** (`GET /v2/verification/karma/:identity`, scope: `Karma Lookup`)<br>2. **Paystack Test Mode API** (`POST /transaction/initialize`, `GET /transaction/verify/:reference`, Webhook `charge.success`) | Real fintech integrations with graceful fallback / test mode support. |
| **Testing** | Jest + Supertest | Unit tests (positive + negative cases for every service) + Integration & concurrency tests (parallel transfers, idempotency replay, deadlock prevention). |
| **Docs & UI** | Branded Landing Page (`/`) + Branded OpenAPI 3.0 Swagger UI (`/docs`) | Gives reviewers immediate one-click verification on the live Render URL. |

---

## 3. Lendsqr Brand & Visual Styling Tokens

All visual surfaces (`/` landing page and `/docs` Swagger UI theme) use Lendsqr's brand system:
- **Primary (Deep Navy)**: `#213F7D`
- **Accent / CTA (Teal)**: `#39CDCC`
- **Body Text (Slate)**: `#545F7D`
- **Surface / Background**: `#FBFBFB` and `#FFFFFF`
- **Semantic Status**: Success `#39CD62`, Warning `#E9B200`, Danger `#E4033B`
- **Typography**: `'Work Sans', 'Avenir Next', -apple-system, BlinkMacSystemFont, sans-serif`

---

## 4. Database Schema & Invariants

1. **Monetary Precision (`BIGINT` minor units / kobo)**:
   - All balances and transaction amounts are stored in **kobo** (`BIGINT`, e.g., `₦1,000.00` = `100000`).
   - Floating-point math is strictly forbidden for money.
2. **Double-Entry Ledger**:
   - Every balance-changing transaction creates:
     - 1 row in `transactions` (`reference`, `provider_reference`, `type`, `status`, `source_wallet_id`, `destination_wallet_id`, `amount`, `narration`, `metadata`)
     - 1 or 2 rows in `ledger_entries` (`transaction_id`, `wallet_id`, `direction` [`debit` | `credit`], `amount`, `balance_before`, `balance_after`)
   - `wallets.balance` is updated atomically inside the same DB transaction and protected by `CHECK (balance >= 0)`.
3. **Core Tables**:
   - `users`: `id` (UUID PK), `email` (UK), `phone` (UK), `first_name`, `last_name`, `password_hash`, `status` (`active` | `blocked`), `blocked_reason`, timestamps.
   - `wallets`: `id` (UUID PK), `user_id` (FK UK), `account_number` (10-digit NUBAN-style UK for easy lookups), `currency` (`NGN`), `balance` (`BIGINT >= 0`), timestamps.
   - `transactions`: `id` (UUID PK), `reference` (UK), `provider_reference` (UK nullable), `type` (`funding` | `transfer`), `status` (`pending` | `successful` | `failed`), `source_wallet_id`, `destination_wallet_id`, `amount` (`BIGINT > 0`), `narration`, `failure_reason`, `metadata` (JSONB), timestamps.
   - `ledger_entries`: `id` (UUID PK), `transaction_id` (FK), `wallet_id` (FK), `direction` (`debit` | `credit`), `amount` (`BIGINT > 0`), `balance_before`, `balance_after`, `created_at`.
   - `idempotency_keys`: `id` (UUID PK), `user_id` (FK), `key` (VARCHAR), `endpoint` (VARCHAR), `request_hash` (VARCHAR), `state` (`in_progress` | `completed`), `response_status` (INT), `response_body` (JSONB), `created_at`, `expires_at`. Unique constraint on `(user_id, key)`.
   - `blacklist`: `id` (UUID PK), `identity` (UK — email or phone), `reason`, `source` (`local` | `karma`), `created_at`.

---

## 5. Concurrency, Locking & Idempotency Rules

1. **Deterministic Lock Ordering (Deadlock Prevention)**:
   - When transferring between Wallet A and Wallet B, sort `[walletA.id, walletB.id]` lexicographically and execute `SELECT * FROM wallets WHERE id IN (?, ?) ORDER BY id ASC FOR UPDATE` inside a single `knex.transaction()`.
   - This prevents circular wait deadlocks when A→B and B→A run simultaneously.
2. **No Network Calls Inside DB Locks**:
   - External HTTP requests (Adjutor Karma, Paystack) MUST happen **outside** any `SELECT ... FOR UPDATE` transaction block.
3. **Idempotency-Key Protection**:
   - Required via `Idempotency-Key` header on `POST /v1/transfers` and `POST /v1/wallets/fund`.
   - Computes a SHA-256 hash of `(method + path + canonical body)`:
     - Same key + same hash + `completed` → return cached response (`X-Idempotent-Replay: true`).
     - Same key + different hash → return `422 IDEMPOTENCY_KEY_REUSED`.
     - Same key + `in_progress` → return `409 REQUEST_IN_PROGRESS`.
4. **Paystack Double-Credit Prevention**:
   - Both `POST /v1/webhooks/paystack` (HMAC-SHA512 verified) and `GET /v1/wallets/fund/verify/:reference` call the same atomic `creditFundingTransaction(reference)` service method, which locks the pending `transactions` row `FOR UPDATE`. If already `successful`, it returns idempotently without double-crediting.
   - We also support a `mode: "simulated" | "paystack"` or automatic simulation fallback when `PAYSTACK_SECRET_KEY` is not set so automated tests and reviewers without Paystack keys can still fund wallets seamlessly.

---

## 6. API Endpoints & Standard Envelope

### Standard Response Envelope
```json
// Success
{
  "status": "success",
  "message": "Human-readable summary",
  "data": { ... }
}

// Error
{
  "status": "error",
  "message": "Human-readable error",
  "error": {
    "code": "MACHINE_READABLE_CODE",
    "details": []
  }
}
```

### Endpoint Map
- `GET /` — Branded Lendsqr HTML landing page with live status & links to `/docs` and `/health`
- `GET /health` — Service & DB health check
- `GET /docs` — Branded Swagger UI (`GET /docs.json` for raw OpenAPI spec)
- `POST /v1/auth/register` — Check local blacklist + Adjutor Karma (`email`, `phone`), create user + wallet atomically, return JWT
- `POST /v1/auth/login` — Authenticate user, return JWT
- `GET /v1/users/me` — Current user profile + wallet summary
- `GET /v1/wallets/me` — Current user's wallet details + ledger balance check
- `POST /v1/wallets/fund` — Initialize Paystack funding (or instant simulated funding in test/fallback mode) (`Idempotency-Key` required)
- `GET /v1/wallets/fund/verify/:reference` — Verify Paystack transaction & credit wallet idempotently
- `POST /v1/webhooks/paystack` — Paystack webhook handler (`x-paystack-signature` HMAC-SHA512)
- `POST /v1/transfers` — Atomic Wallet A → Wallet B transfer by recipient email or wallet ID/account number (`Idempotency-Key` required)
- `GET /v1/transactions` — Paginated transaction history with filters (`type`, `status`, `page`, `limit`)
- `GET /v1/transactions/:reference` — Single transaction with its double-entry ledger entries
- `PATCH /v1/admin/users/:id/block` — Block a user account with reason (`x-admin-key` required)
- `PATCH /v1/admin/users/:id/unblock` — Unblock a user account with reason (`x-admin-key` required)
- `GET /v1/admin/users` — List users & statuses (`x-admin-key` required)
- `POST /v1/admin/blacklist` — Add identity to local blacklist (`x-admin-key` required)
- `DELETE /v1/admin/blacklist/:identity` — Remove identity from local blacklist (`x-admin-key` required)
- `GET /v1/admin/blacklist` — List local blacklisted identities (`x-admin-key` required)

---

## 7. Directory Structure

```text
C:\Users\pc\desktop\lendsqr\
├── AGENTS.md                  # This handbook (keep updated)
├── README.md                  # Assessment documentation, ERD, setup, design decisions
├── package.json
├── tsconfig.json
├── jest.config.ts
├── knexfile.ts
├── Dockerfile
├── docker-compose.yml
├── render.yaml
├── .env.example
├── .gitignore
├── .github/workflows/ci.yml
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── config/
│   │   └── env.ts
│   ├── db/
│   │   ├── knex.ts
│   │   └── migrations/
│   ├── common/
│   │   ├── errors/
│   │   ├── middleware/
│   │   ├── utils/
│   │   └── types/
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── blacklist/
│   │   ├── wallets/
│   │   ├── transfers/
│   │   ├── transactions/
│   │   └── admin/
│   └── docs/
│       ├── openapi.ts
│       └── landing.ts
└── tests/
    ├── unit/
    └── integration/
```

---

## 8. Ordered Build & Commit Roadmap

- [x] **Phase 1**: Clean workspace artifacts (`recon_screenshots/`), initialize Git (`main`), scaffold TypeScript + Express + Knex + Zod + Jest + config + core error/response/middleware primitives. (`chore: scaffold typescript express service and core primitives`)
- [x] **Phase 2**: Database layer — `knexfile.ts`, `src/db/knex.ts`, and migration for all 7 tables with constraints and indexes. (`feat(db): add postgresql schema migrations for users, wallets, ledger and idempotency`)
- [x] **Phase 3**: Blacklist & Onboarding — Local blacklist repository + Lendsqr Adjutor Karma client + Auth/User registration & login with JWT. (`feat(auth): implement user registration with karma blacklist check and jwt login`)
- [x] **Phase 4**: Idempotency & Wallet Funding — Idempotency middleware + Wallet service + Paystack initialize/verify/webhook & simulated test funding. (`feat(wallets): add idempotent wallet funding with paystack and webhook verification`)
- [x] **Phase 5**: Atomic Wallet Transfers & Transactions — Pessimistic row-locked transfers (`ORDER BY id FOR UPDATE`), double-entry ledger recording, and paginated transaction history. (`feat(transfers): implement atomic wallet transfers with row locking and double-entry ledger`)
- [x] **Phase 6**: Admin User Management — Block/unblock users with audit trail (`user_status_events`) and local blacklist management endpoints. (`feat(admin): add user block/unblock controls with audit trail and blacklist management`)
- [x] **Phase 7**: Branded Landing Page & OpenAPI/Swagger UI — Lendsqr-styled `/` status dashboard and `/docs` interactive Swagger UI. (`feat(docs): add lendsqr-branded landing page and openapi swagger documentation`)
- [x] **Phase 8**: Comprehensive Unit & Concurrency Tests — Positive + negative unit tests across all services + parallel transfer race-condition & idempotency replay tests. (`test: add unit and concurrency test suites for transfers, funding, auth and admin`)
- [x] **Phase 9**: DevOps & Documentation — `Dockerfile`, `docker-compose.yml`, `.github/workflows/ci.yml`, `render.yaml`, and comprehensive `README.md` with Mermaid ERD and architectural decisions. (`ci: add docker, github actions ci pipeline, render blueprint and documentation`)
