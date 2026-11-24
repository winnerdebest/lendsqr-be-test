/**
 * Converts a database BIGINT value (returned as string or number by pg)
 * into a safe JavaScript integer representing minor units (kobo).
 */
export function toKoboInt(value: string | number | bigint): number {
  if (typeof value === 'number') {
    return Math.trunc(value);
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid monetary kobo value: ${value}`);
  }
  return parsed;
}

/**
 * Formats kobo minor units into a human-readable NGN display string (e.g., 150050 -> "₦1,500.50").
 */
export function formatKoboToNaira(kobo: string | number | bigint): string {
  const amountKobo = toKoboInt(kobo);
  const sign = amountKobo < 0 ? '-' : '';
  const abs = Math.abs(amountKobo);
  const nairaWhole = Math.floor(abs / 100);
  const koboRemainder = abs % 100;
  const formattedWhole = nairaWhole.toLocaleString('en-NG');
  const formattedKobo = koboRemainder.toString().padStart(2, '0');
  return `${sign}₦${formattedWhole}.${formattedKobo}`;
}

/**
 * Generates a unique, human-readable Lendsqr transaction reference.
 */
export function generateReference(prefix: 'LSQ-FND' | 'LSQ-TRF' = 'LSQ-TRF'): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const randomPart = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `${prefix}-${timestamp}-${randomPart}`;
}

/**
 * Generates a deterministic or random 10-digit NUBAN-style wallet account number starting with '90'.
 */
export function generateAccountNumber(): string {
  const randomDigits = Math.floor(10000000 + Math.random() * 90000000).toString();
  return `90${randomDigits}`;
}
