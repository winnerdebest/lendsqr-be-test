# Lendsqr Wallet Service (`lendsqr-be-test`)

A production-grade wallet and money transfer service built with Node.js, TypeScript, Express, React, and PostgreSQL for the Lendsqr Full-Stack / DevOps Engineer Assessment.

- **Live Deployment (Render)**: https://winner-orluvictor-lendsqr-be-test.onrender.com
- **Interactive API Documentation (Swagger UI)**: https://winner-orluvictor-lendsqr-be-test.onrender.com/docs
- **Health Check Endpoint**: https://winner-orluvictor-lendsqr-be-test.onrender.com/health
- **Repository**: https://github.com/winnerdebest/lendsqr-be-test

---

## Table of Contents

1. [Overview](#1-overview)
2. [Tech Stack](#2-tech-stack)
3. [Database Design and E-R Diagram](#3-database-design-and-e-r-diagram)
4. [Engineering Practices and Assessment Criteria](#4-engineering-practices-and-assessment-criteria)
5. [Design Decisions on Unspecified Requirements](#5-design-decisions-on-unspecified-requirements)
6. [API Reference](#6-api-reference)
7. [Running the Application Locally](#7-running-the-application-locally)
8. [Running the Automated Test Suite](#8-running-the-automated-test-suite)
9. [Deployment and CI/CD](#9-deployment-and-cicd)

---

## 1. Overview

This service handles customer account onboarding, blacklist screening, wallet funding, wallet-to-wallet money transfers, and administrative account controls. It includes both a RESTful JSON API (`/v1/*`) and a full-stack React + TypeScript client portal served from the same instance.

Core capabilities:
- **Account Creation and Wallet Provisioning**: Screens new users against a local blacklist table and the Lendsqr Adjutor Karma API before atomically creating the user record and an NGN wallet with a unique 10-digit account number.
- **Wallet Funding via Paystack**: Integrates with Paystack (`transaction/initialize`, server-to-server `transaction/verify/:reference`, and HMAC-SHA512 verified `charge.success` webhooks) with single-credit row locking.
- **Atomic Wallet-to-Wallet Transfers**: Moves funds from Wallet A to Wallet B with pessimistic row-level locking (`SELECT ... FOR UPDATE`), deterministic lock ordering to prevent deadlocks, recipient name inquiry, and 4-digit transfer PIN authorization.
- **Double-Entry Ledger**: Records balanced debit and credit ledger entries with `balance_before` and `balance_after` snapshots for every transaction.
- **Duplicate and Replay Protection**: Enforces `Idempotency-Key` headers with SHA-256 request payload hashing on all money-moving endpoints.
- **User Management and Administration**: Allows administrators to view platform-wide cashflow metrics, audit all transactions in read-only mode, block or unblock user accounts, and manage blacklisted identities.

---

## 2. Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Runtime & Language | Node.js (22 LTS) + TypeScript (`strict: true`) | Type-safe backend and frontend execution |
| HTTP Framework | Express.js | Layered REST API (`routes -> service -> repository`) |
| Database | PostgreSQL | ACID transactions, row-level locks, and check constraints |
| Query Builder & Migrations | Knex.js (`pg`) | Explicit SQL transaction and locking control without ORM overhead |
| Validation | Zod | Request body and query validation with static type inference |
| Authentication | JWT (`jsonwebtoken`) + `bcryptjs` | Role-based authentication (`user` and `admin`) and password/PIN hashing |
| Frontend Portal | React 18 + TypeScript + Vite | Responsive desktop and mobile banking interface and admin console |
| External Services | Lendsqr Adjutor Karma API & Paystack API | Blacklist verification at signup and card/bank wallet funding |
| Testing | Jest + Supertest | Unit tests (positive and negative cases) and concurrency integration tests |
| DevOps | Docker, GitHub Actions, Render Blueprint | Containerization, automated CI testing against PostgreSQL 16, and cloud hosting |

---

## 3. Database Design and E-R Diagram

```mermaid
erDiagram
    USERS ||--|| WALLETS : owns
    WALLETS ||--o{ LEDGER_ENTRIES : records
    TRANSACTIONS ||--|{ LEDGER_ENTRIES : produces
    USERS ||--o{ IDEMPOTENCY_KEYS : scopes

    USERS {
        uuid id PK
        string email UK
        string phone UK
        string first_name
        string last_name
        string password_hash
        string pin_hash
        string role
        string status
        string blocked_reason
        datetime created_at
        datetime updated_at
    }
    WALLETS {
        uuid id PK
        uuid user_id FK
        string account_number UK
        string currency
        bigint balance
        datetime created_at
        datetime updated_at
    }
    TRANSACTIONS {
        uuid id PK
        string reference UK
        string provider_reference UK
        string type
        string status
        uuid source_wallet_id FK
        uuid destination_wallet_id FK
        bigint amount
        string currency
        string narration
        string failure_reason
        json metadata
        datetime created_at
        datetime updated_at
    }
    LEDGER_ENTRIES {
        uuid id PK
        uuid transaction_id FK
        uuid wallet_id FK
        string direction
        bigint amount
        bigint balance_before
        bigint balance_after
        datetime created_at
    }
    IDEMPOTENCY_KEYS {
        uuid id PK
        uuid user_id FK
        string key
        string endpoint
        string request_hash
        string state
        int response_status
        json response_body
        datetime created_at
        datetime expires_at
    }
    BLACKLIST {
        uuid id PK
        string identity UK
        string reason
        string source
        datetime created_at
    }
```

### Schema Invariants and Constraints

1. **Integer Minor Units (`BIGINT` Kobo)**:
   - All monetary columns (`wallets.balance`, `transactions.amount`, `ledger_entries.amount`, `balance_before`, `balance_after`) are stored as 64-bit integers (`BIGINT`) representing kobo (`100 kobo = 1.00 NGN`).
   - This eliminates IEEE 754 floating-point rounding errors entirely.
2. **Database-Level Check Constraints**:
   - `chk_wallets_balance_non_negative`: `CHECK (balance >= 0)` on `wallets` guarantees at the storage engine level that a wallet balance can never become negative.
   - `chk_transactions_amount_positive` and `chk_ledger_entries_amount_positive`: `CHECK (amount > 0)` prevents zero or negative transaction amounts.
   - `chk_transactions_no_self_transfer`: `CHECK (source_wallet_id IS NULL OR destination_wallet_id IS NULL OR source_wallet_id <> destination_wallet_id)` prevents a wallet from transferring to itself.
3. **Double-Entry Ledger Accounting**:
   - `wallets.balance` acts as the current state, while `ledger_entries` acts as the immutable audit log.
   - Every wallet-to-wallet transfer writes one row to `transactions` and two rows to `ledger_entries` (one `debit` on the source wallet and one `credit` on the destination wallet) within the same database transaction.

---

## 4. Engineering Practices and Assessment Criteria

### Data Integrity and Concurrency
- **Pessimistic Row-Level Locking (`SELECT ... FOR UPDATE`)**:
  - During a transfer between Wallet A and Wallet B, both wallet rows are locked inside a single PostgreSQL transaction before balances are read or updated.
  - Concurrent transfers targeting the same wallet are serialized by PostgreSQL's row lock queue, preventing race conditions and double-spending (verified by our parallel transfer integration test firing 10 simultaneous requests against a single wallet).
- **Deterministic Lock Ordering (Deadlock Prevention)**:
  - If User A transfers to User B at the exact same millisecond that User B transfers to User A, locking "sender first, recipient second" would cause a circular wait deadlock.
  - To prevent deadlocks, the transfer service sorts the two wallet UUIDs lexicographically (`[senderWallet.id, recipientWallet.id].sort()`) and executes:
    ```sql
    SELECT * FROM wallets WHERE id IN ($1, $2) ORDER BY id ASC FOR UPDATE
    ```
  - Because every transaction acquires locks in the exact same ascending ID order, circular waits are impossible (verified by our bidirectional concurrency test).
- **No External Network Calls Inside Database Locks**:
  - External HTTP calls to Lendsqr Adjutor Karma and Paystack always happen outside `SELECT ... FOR UPDATE` transaction blocks so database connections and row locks are held for only a few milliseconds.

### Transaction Safety and Idempotency
- **Idempotency-Key Enforcement**:
  - `POST /v1/transfers` and `POST /v1/wallets/fund` require an `Idempotency-Key` header.
  - The middleware computes a SHA-256 hash of `(HTTP method + path + canonical JSON body)` and claims `(user_id, key)` via a unique database index:
    - **Completed key + matching payload hash**: Returns the cached HTTP status and response with `X-Idempotent-Replay: true` without executing the transaction again.
    - **Completed key + different payload hash**: Rejects with `422 IDEMPOTENCY_KEY_REUSED`.
    - **In-progress key (concurrent duplicate)**: Rejects with `409 REQUEST_IN_PROGRESS`.
- **Single-Credit Settlement on Wallet Funding**:
  - Both the Paystack webhook (`POST /v1/webhooks/paystack`) and the verification endpoint (`GET /v1/wallets/fund/verify/:reference`) settle deposits through the same `settleFundingTransaction` method, which locks the `transactions` row `FOR UPDATE` and checks `status === 'successful'`. Even if the webhook and verification call arrive simultaneously, the wallet is credited exactly once.

### Security and Edge Cases
- **Input Validation**: All request payloads and query parameters are validated with strict Zod schemas.
- **Blocked Account Enforcement**: A blocked account (`status = 'blocked'`) cannot log in, fund its wallet, initiate transfers (`403 USER_BLOCKED`), or receive transfers from other users (`403 RECIPIENT_BLOCKED`).
- **4-Digit Transfer PIN**: Customers can configure a 4-digit transfer PIN (hashed with `bcrypt`), which is verified before outgoing transfers are executed.
- **Webhook Authenticity**: Paystack webhooks are verified against `x-paystack-signature` using HMAC-SHA512 and `crypto.timingSafeEqual`.

---

## 5. Design Decisions on Unspecified Requirements

The assessment brief notes that some requirements are deliberately left open. Below are the gaps identified and the decisions made:

1. **How funds enter a wallet initially**:
   - A transfer service requires a mechanism for money to enter the system. We implemented `POST /v1/wallets/fund` supporting Paystack checkout initialization, server-to-server verification (`GET /v1/wallets/fund/verify/:reference`), and webhook settlement (`POST /v1/webhooks/paystack`), alongside a `simulated` mode for automated tests.
2. **Handling ongoing or abandoned Paystack checkouts**:
   - When a customer opens Paystack checkout and is still entering card details (`ongoing`) or closes the tab without paying (`abandoned`), the verification endpoint keeps the transaction in `pending` state and moves zero funds. Only an actual payment failure (`failed` or `reversed`) marks the record as `failed`, and only a server-verified `success` status credits the wallet.
3. **Can a blocked user receive funds?**:
   - We decided that blocking an account freezes the wallet in both directions. Allowing a blocked user to receive funds complicates compliance freezes, so transfers to a blocked recipient are rejected with `403 RECIPIENT_BLOCKED`.
4. **Blacklist source and caching**:
   - We implemented a two-tier check at registration: first checking our local `blacklist` table, then querying the Lendsqr Adjutor Karma API (`GET /v2/verification/karma/:identity`). When Karma flags an identity in live mode, the result is cached in the local `blacklist` table (`source = 'karma'`) to avoid redundant API calls on repeated signup attempts.
5. **Recipient identification and Name Inquiry**:
   - Customers rarely know internal database UUIDs. Each wallet is assigned a unique 10-digit NUBAN-style account number (`90xxxxxxxx`), and transfers accept the recipient's 10-digit account number, email address, or wallet UUID. We also added `GET /v1/wallets/resolve?identifier=...` so the client portal verifies and displays the recipient's full name before a transfer is confirmed.

---

## 6. API Reference

All API responses follow a consistent JSON envelope:

```json
// Success Envelope
{
  "status": "success",
  "message": "Transfer completed successfully",
  "data": { ... }
}

// Error Envelope
{
  "status": "error",
  "message": "Insufficient wallet balance",
  "error": {
    "code": "INSUFFICIENT_FUNDS",
    "details": []
  }
}
```

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | Public | Service and PostgreSQL health check |
| `GET` | `/docs` | Public | Interactive OpenAPI 3.0 Swagger UI |
| `POST` | `/v1/auth/register` | Public | Register user, run blacklist checks, and provision NGN wallet |
| `POST` | `/v1/auth/login` | Public | Authenticate user or admin and return JWT |
| `GET` | `/v1/users/me` | Bearer JWT | Get current user profile and wallet summary |
| `POST` | `/v1/users/me/pin` | Bearer JWT | Set or update 4-digit transfer PIN |
| `GET` | `/v1/wallets/me` | Bearer JWT | Get wallet balance and ledger reconciliation status |
| `GET` | `/v1/wallets/resolve` | Bearer JWT | Resolve recipient account name by account number or email |
| `GET` | `/v1/wallets/stream` | Bearer JWT | Real-time Server-Sent Events stream for live balance updates |
| `POST` | `/v1/wallets/fund` | Bearer JWT + `Idempotency-Key` | Initialize Paystack deposit (or simulated deposit in test mode) |
| `GET` | `/v1/wallets/fund/verify/:reference` | Bearer JWT | Verify Paystack transaction server-to-server and credit wallet |
| `POST` | `/v1/webhooks/paystack` | `x-paystack-signature` | Paystack HMAC-SHA512 webhook receiver |
| `POST` | `/v1/transfers` | Bearer JWT + `Idempotency-Key` | Execute atomic row-locked Wallet A to Wallet B transfer |
| `GET` | `/v1/transactions` | Bearer JWT | List paginated wallet transactions (`type`, `status`, `page`, `limit`) |
| `GET` | `/v1/transactions/:reference` | Bearer JWT | Get single transaction with its debit and credit ledger entries |
| `GET` | `/v1/admin/users` | Admin JWT | List all customer accounts and wallet balances |
| `PATCH` | `/v1/admin/users/:id/block` | Admin JWT | Block a customer account with reason |
| `PATCH` | `/v1/admin/users/:id/unblock` | Admin JWT | Unblock a customer account with reason |
| `GET` | `/v1/admin/transactions` | Admin JWT | List all platform transactions (read-only audit view) |
| `GET` | `/v1/admin/blacklist` | Admin JWT | List all locally blacklisted identities |
| `POST` | `/v1/admin/blacklist` | Admin JWT | Add an email or phone number to the local blacklist |
| `DELETE` | `/v1/admin/blacklist/:identity` | Admin JWT | Remove an identity from the local blacklist |

---

## 7. Running the Application Locally

### Prerequisites
- **Node.js** 20 or higher (tested on Node.js 22 LTS and 24)
- **PostgreSQL** 15 or higher (local installation, Render PostgreSQL URL, or Docker)

### Step 1: Clone the Repository and Install Dependencies
```bash
git clone https://github.com/winnerdebest/lendsqr-be-test.git
cd lendsqr-be-test
npm install
```

### Step 2: Configure Environment Variables
Copy the example environment file to `.env`:
```bash
cp .env.example .env
```

The `.env` file requires only 4 variables:
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lendsqr_wallet
JWT_SECRET=lendsqr-super-secret-jwt-key-change-in-production-2026
ADJUTOR_API_KEY=your_lendsqr_adjutor_api_key_optional
PAYSTACK_SECRET_KEY=sk_test_your_paystack_test_secret_key_optional
```
- If `ADJUTOR_API_KEY` is omitted, signup still screens users against the local PostgreSQL `blacklist` table.
- If `PAYSTACK_SECRET_KEY` is omitted, `POST /v1/wallets/fund` automatically falls back to instant simulated funding so you can still test deposits and transfers locally.

### Step 3: Run Database Migrations
If you are using Docker and do not have a local PostgreSQL instance running, you can start one with:
```bash
docker compose up -d postgres
```

Apply the PostgreSQL schema migrations (this also seeds the default administrator account):
```bash
npm run migrate:latest
```

### Step 4: Build and Start the Application
```bash
# Build both the backend TypeScript server and the React frontend bundle
npm run build

# Start the development server on port 3000
npm run dev
```

Once running, open your browser to:
- **Customer Wallet Portal**: `http://localhost:3000`
- **Admin Console**: `http://localhost:3000/admin`
  - Default Seeded Admin Email: `admin@lendsqr.com`
  - Default Seeded Admin Password: `AdminPassword123!`
- **Interactive Swagger API Docs**: `http://localhost:3000/docs`
- **Health Check**: `http://localhost:3000/health`

---

## 8. Running the Automated Test Suite

The test suite uses an isolated in-memory PostgreSQL engine (`pg-mem`) by default so tests run immediately on any machine without requiring external services or consuming external API credits. It can also be run against a live PostgreSQL instance by setting `USE_REAL_PG=true`.

```bash
# Run all unit, integration, idempotency, and concurrency tests
npm test

# Run only unit tests
npm run test:unit

# Run only integration and concurrency tests
npm run test:integration

# Run tests with code coverage report
npm run test:coverage
```

### Test Coverage Breakdown
- `tests/unit/blacklist.service.test.ts`: Tests local blacklist matching, Lendsqr Adjutor Karma API verification (`404` clean user, `200` blacklisted hit with local caching, and `503` fail-closed handling).
- `tests/unit/auth.service.test.ts`: Tests user registration, wallet creation, duplicate email/phone rejection (`409`), blacklisted identity rejection (`403`), and blocked user login rejection (`403`).
- `tests/unit/wallets.service.test.ts`: Tests wallet funding, double-entry ledger reconciliation, Paystack initialization and verification, HMAC-SHA512 webhook signature validation, and double-credit prevention when both webhook and verification fire.
- `tests/unit/transfers.service.test.ts`: Tests transfers by email, 10-digit account number, and wallet UUID, debit/credit ledger creation, insufficient funds (`422`), self-transfer (`422`), blocked sender (`403`), blocked recipient (`403`), and invalid amounts (`422`).
- `tests/integration/api.concurrency.test.ts`:
  - Full end-to-end lifecycle (`register -> fund -> transfer -> inspect ledger -> admin block -> transfer rejected -> admin unblock -> transfer succeeds`).
  - Idempotency key replay verification (`X-Idempotent-Replay: true` with single debit) and payload mismatch rejection (`422 IDEMPOTENCY_KEY_REUSED`).
  - Parallel race condition test: fires 10 simultaneous transfers of `1,000.00 NGN` against a wallet holding `5,000.00 NGN` and asserts that exactly 5 succeed, 5 fail with `422 INSUFFICIENT_FUNDS`, and the final balance is `0.00 NGN`.
  - Bidirectional concurrency test: fires simultaneous `A -> B` and `B -> A` transfers and verifies zero deadlocks and exact conservation of funds.

---

## 9. Deployment and CI/CD

- **GitHub Actions CI (`.github/workflows/ci.yml`)**: Automatically runs TypeScript typechecking, production build, in-memory unit/integration tests, and a full test pass against a real PostgreSQL 16 service container on every push and pull request.
- **Render Deployment (`render.yaml` & `Dockerfile`)**: Configured to deploy to `https://winner-orluvictor-lendsqr-be-test.onrender.com`. On startup, `src/server.ts` automatically verifies and applies schema migrations before accepting HTTP traffic.
