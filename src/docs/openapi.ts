export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Lendsqr Wallet & Double-Entry Ledger Service API',
    version: '1.0.0',
    description:
      'Production-grade wallet service built for the Lendsqr Full-Stack / DevOps Engineer Assessment. Supports user onboarding with Lendsqr Adjutor Karma blacklist verification, Paystack & simulated wallet funding, pessimistic row-locked wallet transfers (`SELECT ... FOR UPDATE`), SHA-256 idempotency replay protection, double-entry ledger reconciliation, and audited admin account controls.',
    contact: {
      name: 'Winner OrluVictor',
      email: 'winnerbrown9@gmail.com',
      url: 'https://github.com/winnerdebest/lendsqr-be-test',
    },
  },
  servers: [
    {
      url: '/',
      description: 'Current Active Environment',
    },
    {
      url: 'https://winner-orluvictor-lendsqr-be-test.onrender.com',
      description: 'Render Production Deployment',
    },
  ],
  tags: [
    { name: 'System', description: 'Health check and runtime diagnostics' },
    { name: 'Authentication', description: 'User registration (with Karma blacklist check) and JWT login' },
    { name: 'Users', description: 'Authenticated user profile and wallet summary' },
    { name: 'Wallets & Funding', description: 'Wallet balance, ledger reconciliation, Paystack & simulated funding' },
    { name: 'Transfers', description: 'Atomic row-locked Wallet A to Wallet B money transfers' },
    { name: 'Transactions', description: 'Paginated transaction history and double-entry ledger breakdown' },
    { name: 'Admin', description: 'Back-office user block/unblock controls, audit trail, and blacklist management' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter the JWT `accessToken` returned by `/v1/auth/register` or `/v1/auth/login`',
      },
      AdminKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'x-admin-key',
        description: 'Admin API key (`ADMIN_API_KEY`, default in dev: `lendsqr-admin-secret-key-2026`)',
      },
    },
    parameters: {
      IdempotencyKeyHeader: {
        name: 'Idempotency-Key',
        in: 'header',
        required: true,
        schema: { type: 'string', example: 'idem-trf-2026-0001' },
        description: 'Unique client-generated key (UUID or string up to 128 chars) preventing duplicate transactions on retry.',
      },
    },
    schemas: {
      RegisterRequest: {
        type: 'object',
        required: ['email', 'phone', 'firstName', 'lastName', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'ada.obi@lendsqr.com' },
          phone: { type: 'string', example: '+2348012345678' },
          firstName: { type: 'string', example: 'Ada' },
          lastName: { type: 'string', example: 'Obi' },
          password: { type: 'string', format: 'password', example: 'SecurePass123!' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'ada.obi@lendsqr.com' },
          password: { type: 'string', format: 'password', example: 'SecurePass123!' },
        },
      },
      FundWalletRequest: {
        type: 'object',
        required: ['amountKobo'],
        properties: {
          amountKobo: {
            type: 'integer',
            example: 500000,
            description: 'Amount in kobo minor units (500000 = ₦5,000.00)',
          },
          narration: { type: 'string', example: 'Initial wallet deposit' },
          mode: {
            type: 'string',
            enum: ['auto', 'paystack', 'simulated'],
            default: 'auto',
            description: 'Use `simulated` for instant test credit or `paystack` for Paystack checkout URL',
          },
        },
      },
      TransferRequest: {
        type: 'object',
        required: ['recipientIdentifier', 'amountKobo'],
        properties: {
          recipientIdentifier: {
            type: 'string',
            example: 'chidi.okafor@lendsqr.com',
            description: 'Recipient email address, 10-digit NUBAN account number, or wallet UUID',
          },
          amountKobo: {
            type: 'integer',
            example: 150000,
            description: 'Amount in kobo minor units (150000 = ₦1,500.00)',
          },
          narration: { type: 'string', example: 'Lunch reimbursement' },
        },
      },
      AdminBlockRequest: {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: { type: 'string', example: 'Suspicious velocity detected by compliance' },
        },
      },
      AdminBlacklistRequest: {
        type: 'object',
        required: ['identity', 'reason'],
        properties: {
          identity: { type: 'string', example: 'fraudster@badactor.com' },
          reason: { type: 'string', example: 'Confirmed synthetic identity fraud' },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Service & PostgreSQL health check',
        responses: {
          '200': { description: 'Service and database are healthy' },
        },
      },
    },
    '/v1/auth/register': {
      post: {
        tags: ['Authentication'],
        summary: 'Register a new user and provision an NGN wallet',
        description:
          'Checks email and phone against the local blacklist table and Lendsqr Adjutor Karma API (`/v2/verification/karma/:identity`). If clean, creates the user and their NGN wallet inside a single database transaction.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RegisterRequest' },
            },
          },
        },
        responses: {
          '201': { description: 'User and wallet created successfully' },
          '403': { description: 'User identity is blacklisted (`USER_BLACKLISTED`)' },
          '409': { description: 'Email or phone already exists (`DUPLICATE_USER`)' },
        },
      },
    },
    '/v1/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Authenticate user and obtain JWT access token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' },
            },
          },
        },
        responses: {
          '200': { description: 'Login successful' },
          '401': { description: 'Invalid credentials' },
          '403': { description: 'Account is blocked (`USER_BLOCKED`)' },
        },
      },
    },
    '/v1/users/me': {
      get: {
        tags: ['Users'],
        summary: 'Get current user profile and wallet summary',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Profile retrieved' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/v1/wallets/me': {
      get: {
        tags: ['Wallets & Funding'],
        summary: 'Get wallet balance and live double-entry ledger reconciliation',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Wallet balance and reconciliation check' },
        },
      },
    },
    '/v1/wallets/fund': {
      post: {
        tags: ['Wallets & Funding'],
        summary: 'Fund wallet via Paystack test mode or instant simulation (Idempotent)',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdempotencyKeyHeader' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/FundWalletRequest' },
            },
          },
        },
        responses: {
          '201': { description: 'Wallet funded immediately (simulated mode)' },
          '202': { description: 'Paystack transaction initialized (`authorizationUrl` returned)' },
          '400': { description: 'Missing Idempotency-Key header' },
          '403': { description: 'User is blocked (`USER_BLOCKED`)' },
          '422': { description: 'Idempotency-Key reused with different payload' },
        },
      },
    },
    '/v1/wallets/fund/verify/{reference}': {
      get: {
        tags: ['Wallets & Funding'],
        summary: 'Verify a Paystack transaction reference and credit wallet idempotently',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'reference',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': { description: 'Payment verified and credited once' },
          '404': { description: 'Reference not found' },
        },
      },
    },
    '/v1/webhooks/paystack': {
      post: {
        tags: ['Wallets & Funding'],
        summary: 'Paystack webhook listener (HMAC-SHA512 verified)',
        parameters: [
          {
            name: 'x-paystack-signature',
            in: 'header',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': { description: 'Webhook processed' },
          '401': { description: 'Invalid signature' },
        },
      },
    },
    '/v1/transfers': {
      post: {
        tags: ['Transfers'],
        summary: 'Transfer funds from your wallet to another user wallet (Idempotent & Row-Locked)',
        description:
          'Acquires pessimistic row locks (`SELECT ... FOR UPDATE`) on both wallets sorted by wallet ID to prevent deadlocks, validates balances and account status, updates balances, and writes double-entry debit and credit ledger rows atomically.',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdempotencyKeyHeader' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TransferRequest' },
            },
          },
        },
        responses: {
          '201': { description: 'Transfer completed and ledger entries created' },
          '403': { description: 'Sender or recipient is blocked (`USER_BLOCKED` / `RECIPIENT_BLOCKED`)' },
          '404': { description: 'Recipient not found' },
          '409': { description: 'Concurrent request with same Idempotency-Key in progress' },
          '422': {
            description:
              'Insufficient funds (`INSUFFICIENT_FUNDS`), self-transfer (`SELF_TRANSFER`), or reused idempotency key (`IDEMPOTENCY_KEY_REUSED`)',
          },
        },
      },
    },
    '/v1/transactions': {
      get: {
        tags: ['Transactions'],
        summary: 'List paginated wallet transactions',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['funding', 'transfer'] } },
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['pending', 'successful', 'failed'] },
          },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          '200': { description: 'Paginated transaction history' },
        },
      },
    },
    '/v1/transactions/{reference}': {
      get: {
        tags: ['Transactions'],
        summary: 'Get single transaction with its double-entry ledger entries',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'reference', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Transaction details with debit/credit ledger entries' },
          '404': { description: 'Transaction not found' },
        },
      },
    },
    '/v1/admin/users': {
      get: {
        tags: ['Admin'],
        summary: 'List all users and wallet summaries',
        security: [{ AdminKeyAuth: [] }],
        responses: {
          '200': { description: 'List of users and wallets' },
        },
      },
    },
    '/v1/admin/users/{id}/block': {
      patch: {
        tags: ['Admin'],
        summary: 'Block a user account and freeze wallet transfers',
        security: [{ AdminKeyAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AdminBlockRequest' },
            },
          },
        },
        responses: {
          '200': { description: 'User blocked and audit event recorded' },
        },
      },
    },
    '/v1/admin/users/{id}/unblock': {
      patch: {
        tags: ['Admin'],
        summary: 'Unblock a user account',
        security: [{ AdminKeyAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AdminBlockRequest' },
            },
          },
        },
        responses: {
          '200': { description: 'User unblocked' },
        },
      },
    },
    '/v1/admin/blacklist': {
      get: {
        tags: ['Admin'],
        summary: 'List all blacklisted identities',
        security: [{ AdminKeyAuth: [] }],
        responses: {
          '200': { description: 'Blacklist retrieved' },
        },
      },
      post: {
        tags: ['Admin'],
        summary: 'Add an email, phone, or BVN to the local blacklist',
        security: [{ AdminKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AdminBlacklistRequest' },
            },
          },
        },
        responses: {
          '201': { description: 'Identity blacklisted' },
        },
      },
    },
    '/v1/admin/blacklist/{identity}': {
      delete: {
        tags: ['Admin'],
        summary: 'Remove an identity from the local blacklist',
        security: [{ AdminKeyAuth: [] }],
        parameters: [
          { name: 'identity', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Identity removed' },
        },
      },
    },
  },
};
