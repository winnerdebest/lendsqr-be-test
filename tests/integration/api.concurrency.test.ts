import request from 'supertest';
import { app } from '../../src/app';
import { APP_CONSTANTS } from '../../src/config/env';
import {
  resetTestDatabase,
  setupTestDatabase,
  teardownTestDatabase,
} from '../helpers/testDb';

describe('Wallet API End-to-End, Idempotency & Concurrency Integration Suite', () => {
  async function getAdminToken(): Promise<string> {
    const res = await request(app).post('/v1/auth/login').send({
      email: APP_CONSTANTS.DEFAULT_ADMIN_EMAIL,
      password: APP_CONSTANTS.DEFAULT_ADMIN_PASSWORD,
    });
    return res.body.data.accessToken as string;
  }

  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  it('serves the Lendsqr-branded web app, OpenAPI spec, and /health endpoint', async () => {
    const landingRes = await request(app).get('/').set('Accept', 'text/html');
    expect(landingRes.status).toBe(200);
    expect(landingRes.text).toContain('Lendsqr');

    const healthRes = await request(app).get('/health');
    expect(healthRes.status).toBe(200);
    expect(healthRes.body.status).toBe('success');
    expect(healthRes.body.data.database.connected).toBe(true);

    const openApiRes = await request(app).get('/docs.json');
    expect(openApiRes.status).toBe(200);
    expect(openApiRes.body.openapi).toBe('3.0.3');
  });

  it('completes full lifecycle: register -> fund -> transfer -> inspect ledger -> block -> reject -> unblock -> transfer', async () => {
    // 1. Register Alice
    const aliceReg = await request(app).post('/v1/auth/register').send({
      email: 'alice@lendsqr.com',
      phone: '+2348030001001',
      firstName: 'Alice',
      lastName: 'Nwosu',
      password: 'Password123!',
    });
    expect(aliceReg.status).toBe(201);
    const aliceToken = aliceReg.body.data.accessToken as string;
    const aliceId = aliceReg.body.data.user.id as string;

    // 2. Register Bob
    const bobReg = await request(app).post('/v1/auth/register').send({
      email: 'bob@lendsqr.com',
      phone: '+2348030001002',
      firstName: 'Bob',
      lastName: 'Adeyemi',
      password: 'Password123!',
    });
    expect(bobReg.status).toBe(201);
    const bobToken = bobReg.body.data.accessToken as string;

    // 3. Fund Alice with ₦10,000.00 (1,000,000 kobo)
    const fundRes = await request(app)
      .post('/v1/wallets/fund')
      .set('Authorization', `Bearer ${aliceToken}`)
      .set('Idempotency-Key', 'idem-fund-alice-001')
      .send({
        amountKobo: 1000000,
        narration: 'Alice initial deposit',
        mode: 'simulated',
      });
    expect(fundRes.status).toBe(201);
    expect(fundRes.body.data.wallet.balanceAfterKobo).toBe(1000000);

    // 4. Alice transfers ₦4,000.00 (400,000 kobo) to Bob
    const trfRes = await request(app)
      .post('/v1/transfers')
      .set('Authorization', `Bearer ${aliceToken}`)
      .set('Idempotency-Key', 'idem-trf-alice-bob-001')
      .send({
        recipientIdentifier: 'bob@lendsqr.com',
        amountKobo: 400000,
        narration: 'Project milestone payout',
      });
    expect(trfRes.status).toBe(201);
    const trfRef = trfRes.body.data.reference as string;

    // 5. Inspect double-entry ledger on transaction detail endpoint
    const txDetailRes = await request(app)
      .get(`/v1/transactions/${trfRef}`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(txDetailRes.status).toBe(200);
    expect(txDetailRes.body.data.ledgerEntries).toHaveLength(2);

    // 6. Admin logs in via JWT and blocks Alice
    const adminToken = await getAdminToken();
    const blockRes = await request(app)
      .patch(`/v1/admin/users/${aliceId}/block`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reason: 'Temporary compliance hold',
      });
    expect(blockRes.status).toBe(200);
    expect(blockRes.body.data.user.status).toBe('blocked');

    // 7. Blocked Alice cannot send money (403 USER_BLOCKED)
    const blockedSendRes = await request(app)
      .post('/v1/transfers')
      .set('Authorization', `Bearer ${aliceToken}`)
      .set('Idempotency-Key', 'idem-trf-blocked-send')
      .send({
        recipientIdentifier: 'bob@lendsqr.com',
        amountKobo: 100000,
        narration: 'Should be blocked',
      });
    expect(blockedSendRes.status).toBe(403);
    expect(blockedSendRes.body.error.code).toBe('USER_BLOCKED');

    // 8. Bob cannot send money to blocked Alice (403 RECIPIENT_BLOCKED)
    const blockedReceiveRes = await request(app)
      .post('/v1/transfers')
      .set('Authorization', `Bearer ${bobToken}`)
      .set('Idempotency-Key', 'idem-trf-blocked-recv')
      .send({
        recipientIdentifier: 'alice@lendsqr.com',
        amountKobo: 100000,
        narration: 'Should reject blocked recipient',
      });
    expect(blockedReceiveRes.status).toBe(403);
    expect(blockedReceiveRes.body.error.code).toBe('RECIPIENT_BLOCKED');

    // 9. Admin unblocks Alice
    const unblockRes = await request(app)
      .patch(`/v1/admin/users/${aliceId}/unblock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reason: 'Compliance hold cleared',
      });
    expect(unblockRes.status).toBe(200);
    expect(unblockRes.body.data.user.status).toBe('active');

    // 10. Unblocked Alice can transfer again
    const trfAfterUnblock = await request(app)
      .post('/v1/transfers')
      .set('Authorization', `Bearer ${aliceToken}`)
      .set('Idempotency-Key', 'idem-trf-after-unblock')
      .send({
        recipientIdentifier: 'bob@lendsqr.com',
        amountKobo: 100000,
        narration: 'Transfer after unblock',
      });
    expect(trfAfterUnblock.status).toBe(201);
    expect(trfAfterUnblock.body.data.sender.balanceAfterKobo).toBe(500000);
  });

  it('enforces Idempotency-Key protection: replays identical request once and rejects reused key with modified payload (422)', async () => {
    const senderReg = await request(app).post('/v1/auth/register').send({
      email: 'idem.sender@lendsqr.com',
      phone: '+2348030002001',
      firstName: 'Idem',
      lastName: 'Sender',
      password: 'Password123!',
    });
    const senderToken = senderReg.body.data.accessToken as string;

    await request(app).post('/v1/auth/register').send({
      email: 'idem.recipient@lendsqr.com',
      phone: '+2348030002002',
      firstName: 'Idem',
      lastName: 'Recipient',
      password: 'Password123!',
    });

    await request(app)
      .post('/v1/wallets/fund')
      .set('Authorization', `Bearer ${senderToken}`)
      .set('Idempotency-Key', 'fund-idem-key-1')
      .send({ amountKobo: 1000000, mode: 'simulated' });

    // Missing Idempotency-Key -> 400 IDEMPOTENCY_KEY_REQUIRED
    const missingKeyRes = await request(app)
      .post('/v1/transfers')
      .set('Authorization', `Bearer ${senderToken}`)
      .send({
        recipientIdentifier: 'idem.recipient@lendsqr.com',
        amountKobo: 200000,
      });
    expect(missingKeyRes.status).toBe(400);
    expect(missingKeyRes.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');

    // First transfer with key 'trf-replay-key-001'
    const firstRes = await request(app)
      .post('/v1/transfers')
      .set('Authorization', `Bearer ${senderToken}`)
      .set('Idempotency-Key', 'trf-replay-key-001')
      .send({
        recipientIdentifier: 'idem.recipient@lendsqr.com',
        amountKobo: 200000,
        narration: 'Exact once transfer',
      });
    expect(firstRes.status).toBe(201);

    // Replay exact same request with same Idempotency-Key -> returns cached receipt, no second debit
    const replayRes = await request(app)
      .post('/v1/transfers')
      .set('Authorization', `Bearer ${senderToken}`)
      .set('Idempotency-Key', 'trf-replay-key-001')
      .send({
        recipientIdentifier: 'idem.recipient@lendsqr.com',
        amountKobo: 200000,
        narration: 'Exact once transfer',
      });
    expect(replayRes.status).toBe(201);
    expect(replayRes.headers['x-idempotent-replay']).toBe('true');
    expect(replayRes.body.data.reference).toBe(firstRes.body.data.reference);

    // Verify sender balance was debited ONLY ONCE (1,000,000 - 200,000 = 800,000)
    const walletCheck = await request(app)
      .get('/v1/wallets/me')
      .set('Authorization', `Bearer ${senderToken}`);
    expect(walletCheck.body.data.balanceKobo).toBe(800000);

    // Reusing 'trf-replay-key-001' with a different amount -> 422 IDEMPOTENCY_KEY_REUSED
    const mutatedRes = await request(app)
      .post('/v1/transfers')
      .set('Authorization', `Bearer ${senderToken}`)
      .set('Idempotency-Key', 'trf-replay-key-001')
      .send({
        recipientIdentifier: 'idem.recipient@lendsqr.com',
        amountKobo: 500000,
        narration: 'Exact once transfer',
      });
    expect(mutatedRes.status).toBe(422);
    expect(mutatedRes.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('prevents double-spend and preserves exact ledger conservation under parallel transfer requests', async () => {
    // Sender starts with ₦5,000.00 (500,000 kobo)
    // Fires 10 parallel transfers of ₦1,000.00 (100,000 kobo) each (total attempted: ₦10,000.00)
    // Exactly 5 must succeed and 5 must fail with 422 INSUFFICIENT_FUNDS. Final balance must be 0.
    const senderReg = await request(app).post('/v1/auth/register').send({
      email: 'race.sender@lendsqr.com',
      phone: '+2348030003001',
      firstName: 'Race',
      lastName: 'Sender',
      password: 'Password123!',
    });
    const senderToken = senderReg.body.data.accessToken as string;

    const recipientReg = await request(app).post('/v1/auth/register').send({
      email: 'race.recipient@lendsqr.com',
      phone: '+2348030003002',
      firstName: 'Race',
      lastName: 'Recipient',
      password: 'Password123!',
    });
    const recipientToken = recipientReg.body.data.accessToken as string;

    await request(app)
      .post('/v1/wallets/fund')
      .set('Authorization', `Bearer ${senderToken}`)
      .set('Idempotency-Key', 'race-fund-001')
      .send({ amountKobo: 500000, mode: 'simulated' });

    const parallelAttempts = Array.from({ length: 10 }, (_, idx) =>
      request(app)
        .post('/v1/transfers')
        .set('Authorization', `Bearer ${senderToken}`)
        .set('Idempotency-Key', `race-trf-key-${idx}`)
        .send({
          recipientIdentifier: 'race.recipient@lendsqr.com',
          amountKobo: 100000,
          narration: `Parallel transfer #${idx + 1}`,
        }),
    );

    const responses = await Promise.all(parallelAttempts);
    const succeeded = responses.filter((r) => r.status === 201);
    const failedInsufficient = responses.filter(
      (r) => r.status === 422 && r.body.error?.code === 'INSUFFICIENT_FUNDS',
    );

    expect(succeeded).toHaveLength(5);
    expect(failedInsufficient).toHaveLength(5);

    const senderWallet = await request(app)
      .get('/v1/wallets/me')
      .set('Authorization', `Bearer ${senderToken}`);
    const recipientWallet = await request(app)
      .get('/v1/wallets/me')
      .set('Authorization', `Bearer ${recipientToken}`);

    expect(senderWallet.body.data.balanceKobo).toBe(0);
    expect(senderWallet.body.data.isReconciled).toBe(true);
    expect(recipientWallet.body.data.balanceKobo).toBe(500000);
    expect(recipientWallet.body.data.isReconciled).toBe(true);
  });

  it('handles simultaneous bidirectional transfers (A -> B and B -> A) without deadlock or balance drift', async () => {
    const userAReg = await request(app).post('/v1/auth/register').send({
      email: 'bidir.a@lendsqr.com',
      phone: '+2348030004001',
      firstName: 'User',
      lastName: 'Alpha',
      password: 'Password123!',
    });
    const tokenA = userAReg.body.data.accessToken as string;

    const userBReg = await request(app).post('/v1/auth/register').send({
      email: 'bidir.b@lendsqr.com',
      phone: '+2348030004002',
      firstName: 'User',
      lastName: 'Beta',
      password: 'Password123!',
    });
    const tokenB = userBReg.body.data.accessToken as string;

    // Both start with 1,000,000 kobo (₦10,000.00)
    await Promise.all([
      request(app)
        .post('/v1/wallets/fund')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Idempotency-Key', 'bidir-fund-a')
        .send({ amountKobo: 1000000, mode: 'simulated' }),
      request(app)
        .post('/v1/wallets/fund')
        .set('Authorization', `Bearer ${tokenB}`)
        .set('Idempotency-Key', 'bidir-fund-b')
        .send({ amountKobo: 1000000, mode: 'simulated' }),
    ]);

    // A sends 4 transfers of 50,000 kobo to B (-200,000)
    // B sends 4 transfers of 30,000 kobo to A (-120,000)
    // Expected final: A = 1,000,000 - 200,000 + 120,000 = 920,000
    // Expected final: B = 1,000,000 + 200,000 - 120,000 = 1,080,000
    const bidirectionalOps = [
      ...Array.from({ length: 4 }, (_, i) =>
        request(app)
          .post('/v1/transfers')
          .set('Authorization', `Bearer ${tokenA}`)
          .set('Idempotency-Key', `a-to-b-${i}`)
          .send({
            recipientIdentifier: 'bidir.b@lendsqr.com',
            amountKobo: 50000,
          }),
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        request(app)
          .post('/v1/transfers')
          .set('Authorization', `Bearer ${tokenB}`)
          .set('Idempotency-Key', `b-to-a-${i}`)
          .send({
            recipientIdentifier: 'bidir.a@lendsqr.com',
            amountKobo: 30000,
          }),
      ),
    ];

    const results = await Promise.all(bidirectionalOps);
    for (const res of results) {
      expect(res.status).toBe(201);
    }

    const walletA = await request(app)
      .get('/v1/wallets/me')
      .set('Authorization', `Bearer ${tokenA}`);
    const walletB = await request(app)
      .get('/v1/wallets/me')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(walletA.body.data.balanceKobo).toBe(920000);
    expect(walletA.body.data.isReconciled).toBe(true);
    expect(walletB.body.data.balanceKobo).toBe(1080000);
    expect(walletB.body.data.isReconciled).toBe(true);
  });

  it('blocks blacklisted identities added via Admin API from registering new accounts', async () => {
    const adminToken = await getAdminToken();
    const addBlRes = await request(app)
      .post('/v1/admin/blacklist')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        identity: 'known.scammer@bad.com',
        reason: 'Confirmed identity theft',
      });
    expect(addBlRes.status).toBe(201);

    const regAttempt = await request(app).post('/v1/auth/register').send({
      email: 'known.scammer@bad.com',
      phone: '+2348030005001',
      firstName: 'Scam',
      lastName: 'User',
      password: 'Password123!',
    });
    expect(regAttempt.status).toBe(403);
    expect(regAttempt.body.error.code).toBe('USER_BLACKLISTED');
  });
});
