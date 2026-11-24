import { AppError } from '../../src/common/errors/AppError';
import { BlacklistRecord } from '../../src/common/types/entities';
import { BlacklistRepository } from '../../src/modules/blacklist/blacklist.repository';
import { BlacklistService } from '../../src/modules/blacklist/blacklist.service';
import { KarmaClient } from '../../src/modules/blacklist/karma.client';

describe('BlacklistService & KarmaClient (Unit Tests)', () => {
  let mockRepo: jest.Mocked<BlacklistRepository>;
  let mockKarma: jest.Mocked<KarmaClient>;
  let service: BlacklistService;

  beforeEach(() => {
    mockRepo = {
      normalizeIdentity: jest.fn((v: string) => v.trim().toLowerCase()),
      findByIdentity: jest.fn(),
      findMatchingIdentities: jest.fn(),
      upsert: jest.fn(),
      removeByIdentity: jest.fn(),
      listAll: jest.fn(),
    } as unknown as jest.Mocked<BlacklistRepository>;

    mockKarma = {
      isConfigured: jest.fn().mockReturnValue(true),
      checkIdentity: jest.fn(),
    } as unknown as jest.Mocked<KarmaClient>;

    service = new BlacklistService(mockRepo, mockKarma);
  });

  describe('Positive Cases', () => {
    it('allows clean identities when neither local DB nor Lendsqr Karma flags them', async () => {
      mockRepo.findMatchingIdentities.mockResolvedValue([]);
      mockKarma.checkIdentity.mockResolvedValue({
        blacklisted: false,
        identity: 'clean@lendsqr.com',
        source: 'karma',
      });

      await expect(
        service.assertNotBlacklisted(['clean@lendsqr.com', '+2348011112222']),
      ).resolves.toBeUndefined();

      expect(mockRepo.findMatchingIdentities).toHaveBeenCalledWith([
        'clean@lendsqr.com',
        '+2348011112222',
      ]);
      expect(mockKarma.checkIdentity).toHaveBeenCalledTimes(2);
    });

    it('adds and removes local blacklist entries cleanly', async () => {
      const sampleRecord: BlacklistRecord = {
        id: '11111111-1111-4111-8111-111111111111',
        identity: 'flagged@domain.com',
        reason: 'Manual compliance hold',
        source: 'local',
        created_at: new Date(),
      };
      mockRepo.upsert.mockResolvedValue(sampleRecord);
      mockRepo.removeByIdentity.mockResolvedValue(true);

      const added = await service.addToBlacklist('flagged@domain.com', 'Manual compliance hold');
      expect(added.identity).toBe('flagged@domain.com');

      await expect(service.removeFromBlacklist('flagged@domain.com')).resolves.toBeUndefined();
    });
  });

  describe('Negative Cases', () => {
    it('rejects onboarding with 403 USER_BLACKLISTED when identity exists in local blacklist table', async () => {
      mockRepo.findMatchingIdentities.mockResolvedValue([
        {
          id: '22222222-2222-4222-8222-222222222222',
          identity: 'badactor@fraud.com',
          reason: 'Chargeback fraud',
          source: 'local',
          created_at: new Date(),
        },
      ]);

      await expect(
        service.assertNotBlacklisted(['badactor@fraud.com', '+2348099998888']),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'USER_BLACKLISTED',
      });

      // Must short-circuit before calling external Karma API
      expect(mockKarma.checkIdentity).not.toHaveBeenCalled();
    });

    it('rejects onboarding with 403 USER_BLACKLISTED when Lendsqr Adjutor Karma flags an identity and caches it locally', async () => {
      mockRepo.findMatchingIdentities.mockResolvedValue([]);
      mockKarma.checkIdentity
        .mockResolvedValueOnce({
          blacklisted: false,
          identity: ' defaulter@loan.com',
          source: 'karma',
        })
        .mockResolvedValueOnce({
          blacklisted: true,
          identity: '+2348077776666',
          reason: 'Chronic loan default',
          source: 'karma',
        });

      await expect(
        service.assertNotBlacklisted(['defaulter@loan.com', '+2348077776666']),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'USER_BLACKLISTED',
      });

      expect(mockRepo.upsert).toHaveBeenCalledWith(
        '+2348077776666',
        'Chronic loan default',
        'karma',
      );
    });

    it('throws 404 NOT_FOUND when removing an identity that is not in the local blacklist', async () => {
      mockRepo.removeByIdentity.mockResolvedValue(false);

      await expect(service.removeFromBlacklist('missing@domain.com')).rejects.toThrow(AppError);
      await expect(service.removeFromBlacklist('missing@domain.com')).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });

    it('KarmaClient handles 404 clean responses, 200 blacklist hits, and fail-closed network errors', async () => {
      const originalFetch = global.fetch;
      try {
        // 1. 404 -> Not blacklisted
        global.fetch = jest.fn().mockResolvedValue({
          status: 404,
          ok: false,
        } as unknown as Response);

        const client = new KarmaClient('https://adjutor.lendsqr.com/v2', 'test_secret_key', true);
        const cleanRes = await client.checkIdentity('clean@user.com');
        expect(cleanRes.blacklisted).toBe(false);

        // 2. 200 with karma_identity -> Blacklisted
        global.fetch = jest.fn().mockResolvedValue({
          status: 200,
          ok: true,
          json: async () => ({
            status: 'success',
            message: 'Successful',
            data: {
              karma_identity: '0zspgifzbo.ga',
              reason: 'Fraudulent application',
            },
          }),
        } as unknown as Response);

        const hitRes = await client.checkIdentity('0zspgifzbo.ga');
        expect(hitRes.blacklisted).toBe(true);
        expect(hitRes.reason).toBe('Fraudulent application');

        // 3. 500 with failClosed = true -> throws 503 EXTERNAL_SERVICE_UNAVAILABLE
        global.fetch = jest.fn().mockResolvedValue({
          status: 500,
          ok: false,
        } as unknown as Response);

        await expect(client.checkIdentity('any@user.com')).rejects.toMatchObject({
          statusCode: 503,
          code: 'EXTERNAL_SERVICE_UNAVAILABLE',
        });
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});
