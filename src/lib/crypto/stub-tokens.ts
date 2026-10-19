import crypto from 'node:crypto';

export interface StubTokenData {
  stubSerial: string;
  slotNumber: number;
}

const SERIAL_REGEX = /^[A-Z0-9]+-[A-Z0-9]+-[0-9]{4}-S[1-6]$/;

/**
 * Validates that the event signing secret meets cryptographic strength requirements.
 */
export function getVerifiedHmacSecret(): string {

  const secret = process.env.EVENT_HMAC_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('CRITICAL: EVENT_HMAC_SECRET environment variable is missing or shorter than 32 characters.');
  }

  return secret;
}

/**
 * Generates an HMAC-SHA256 signature for a ticket stub.
 * Produces a URL-safe 24-character compact signature.
 */
export function generateStubSignature(
  stubSerial: string,
  slotNumber: number,
  secretKey: string
): string {

  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(`${stubSerial}:${slotNumber}`);

  return hmac.digest('base64url').slice(0, 24);
}

/**
 * Generates an 8-character uppercase hexadecimal HMAC-SHA256 verification PIN
 * printed on physical ticket stubs for cryptographic manual entry fallback.
 */
export function generateStubVerificationCode(
  stubSerial: string,
  slotNumber: number,
  secretKey: string
): string {

  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(`${stubSerial}:${slotNumber}:PIN`);

  return hmac.digest('hex').slice(0, 8).toUpperCase();
}

/**
 * Performs a timing-safe string comparison with a mandatory byte-length guard.
 */
function timingSafeEqualString(expected: string, provided: string): boolean {

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const providedBuffer = Buffer.from(provided, 'utf8');

  if (expectedBuffer.byteLength !== providedBuffer.byteLength) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

/**
 * Encodes a stub payload into a single URL-safe Base64 string for QR code generation.
 */
export function encodeStubPayload(
  stubSerial: string,
  slotNumber: number,
  secretKey: string
): string {

  const signature = generateStubSignature(stubSerial, slotNumber, secretKey);
  const rawString = `${stubSerial}|${slotNumber}|${signature}`;

  return Buffer.from(rawString, 'utf8').toString('base64url');
}

/**
 * Decodes and cryptographically verifies a ticket stub payload in memory before any DB access.
 * Supports both Base64URL QR tokens and manual `<stubSerial>.<verificationCode>` / `<stubSerial>:<verificationCode>` entries.
 */
export function verifyStubPayload(
  payloadInput: string,
  secretKey: string
): { isValid: boolean; data?: StubTokenData } {

  try {
    const trimmed = payloadInput.trim();

    // Case 1: Human-entered manual token `<stubSerial>.<verificationCode>` or `<stubSerial>:<verificationCode>`
    const manualMatch = trimmed.match(/^([A-Za-z0-9]+-[A-Za-z0-9]+-[0-9]{4}-S([1-6]))[.:]([A-Za-z0-9_-]{8,24})$/);
    if (manualMatch) {
      const normalizedSerial = manualMatch[1].toUpperCase();
      const slotNumber = Number(manualMatch[2]);
      const providedToken = manualMatch[3];

      if (!SERIAL_REGEX.test(normalizedSerial)) {
        return { isValid: false };
      }

      const expectedPin = generateStubVerificationCode(normalizedSerial, slotNumber, secretKey);
      const expectedFullSig = generateStubSignature(normalizedSerial, slotNumber, secretKey);

      const isPinMatch = timingSafeEqualString(expectedPin, providedToken.toUpperCase());
      const isFullSigMatch = timingSafeEqualString(expectedFullSig, providedToken);

      if (!isPinMatch && !isFullSigMatch) {
        return { isValid: false };
      }

      return {
        isValid: true,
        data: {
          stubSerial: normalizedSerial,
          slotNumber,
        },
      };
    }

    // Case 2: Base64URL encoded QR payload (`<stubSerial>|<slotNumber>|<signature>`)
    const rawString = Buffer.from(trimmed, 'base64url').toString('utf8');
    const parts = rawString.split('|');

    if (parts.length !== 3) {
      return { isValid: false };
    }

    const [stubSerial, slotStr, providedSignature] = parts;

    if (!/^[1-6]$/.test(slotStr)) {
      return { isValid: false };
    }
    const slotNumber = Number(slotStr);

    if (!stubSerial || !providedSignature || !SERIAL_REGEX.test(stubSerial)) {
      return { isValid: false };
    }

    const expectedSignature = generateStubSignature(stubSerial, slotNumber, secretKey);
    if (!timingSafeEqualString(expectedSignature, providedSignature)) {
      return { isValid: false };
    }

    return {
      isValid: true,
      data: {
        stubSerial,
        slotNumber,
      },
    };
  } catch {
    return { isValid: false };
  }
}

