import crypto from 'crypto';
import { AppError } from '../../common/errors/AppError';
import { env } from '../../config/env';

export interface PaystackInitializeResponse {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

export interface PaystackVerifyResponse {
  status: 'success' | 'failed' | 'abandoned' | string;
  reference: string;
  amountKobo: number;
  currency: string;
  channel?: string;
  paidAt?: string | null;
}

interface PaystackApiEnvelope<T> {
  status: boolean;
  message: string;
  data: T;
}

export class PaystackClient {
  private readonly baseUrl: string;
  private readonly secretKey: string;
  private readonly callbackUrl: string;

  constructor(
    baseUrl = env.PAYSTACK_BASE_URL,
    secretKey = env.PAYSTACK_SECRET_KEY,
    callbackUrl = env.PAYSTACK_CALLBACK_URL,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.secretKey = secretKey;
    this.callbackUrl = callbackUrl;
  }

  public isConfigured(): boolean {
    return Boolean(this.secretKey && this.secretKey.trim().length > 0 && this.secretKey !== 'mock');
  }

  public async initializeTransaction(params: {
    email: string;
    amountKobo: number;
    reference: string;
    callbackUrl?: string;
    metadata?: Record<string, unknown>;
  }): Promise<PaystackInitializeResponse> {
    if (!this.isConfigured()) {
      throw AppError.serviceUnavailable('Paystack secret key is not configured');
    }

    const response = await fetch(`${this.baseUrl}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        email: params.email,
        amount: String(params.amountKobo),
        reference: params.reference,
        currency: 'NGN',
        callback_url: params.callbackUrl || this.callbackUrl,
        metadata: params.metadata || {},
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw AppError.serviceUnavailable(`Paystack initialize failed with HTTP ${response.status}`);
    }

    const body = (await response.json()) as PaystackApiEnvelope<{
      authorization_url: string;
      access_code: string;
      reference: string;
    }>;

    if (!body.status || !body.data) {
      throw AppError.unprocessable(
        body.message || 'Failed to initialize Paystack transaction',
        'PAYMENT_VERIFICATION_FAILED',
      );
    }

    return {
      authorizationUrl: body.data.authorization_url,
      accessCode: body.data.access_code,
      reference: body.data.reference,
    };
  }

  public async verifyTransaction(reference: string): Promise<PaystackVerifyResponse> {
    if (!this.isConfigured()) {
      throw AppError.serviceUnavailable('Paystack secret key is not configured');
    }

    const response = await fetch(
      `${this.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!response.ok) {
      throw AppError.unprocessable(
        `Unable to verify transaction '${reference}' with Paystack (HTTP ${response.status})`,
        'PAYMENT_VERIFICATION_FAILED',
      );
    }

    const body = (await response.json()) as PaystackApiEnvelope<{
      status: string;
      reference: string;
      amount: number;
      currency: string;
      channel?: string;
      paid_at?: string | null;
    }>;

    if (!body.status || !body.data) {
      throw AppError.unprocessable(
        body.message || 'Paystack transaction verification failed',
        'PAYMENT_VERIFICATION_FAILED',
      );
    }

    return {
      status: body.data.status,
      reference: body.data.reference,
      amountKobo: Number(body.data.amount),
      currency: body.data.currency || 'NGN',
      channel: body.data.channel,
      paidAt: body.data.paid_at,
    };
  }

  public verifyWebhookSignature(rawBody: Buffer | string, signatureHeader?: string): boolean {
    if (!signatureHeader || !this.secretKey) {
      return false;
    }
    const expectedHash = crypto
      .createHmac('sha512', this.secretKey)
      .update(rawBody)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedHash, 'utf8');
    const providedBuf = Buffer.from(signatureHeader.trim(), 'utf8');

    if (expectedBuf.length !== providedBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  }
}

export const paystackClient = new PaystackClient();
