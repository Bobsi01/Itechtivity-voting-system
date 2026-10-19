import {
  generateStubSignature,
  encodeStubPayload,
  verifyStubPayload,
} from './stub-tokens';

const TEST_SECRET = 'itech2027_test_secret_key_32_bytes_long_string';

function runCryptoTests() {
  console.log('Running Cryptographic Verification Suite...');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  // Test 1: Valid payload generation and verification
  const serial1 = 'B27-B01-0001-S1';
  const slot1 = 1;
  const payload1 = encodeStubPayload(serial1, slot1, TEST_SECRET);
  const verify1 = verifyStubPayload(payload1, TEST_SECRET);
  assert(verify1.isValid === true, 'Valid stub payload verifies successfully');
  assert(verify1.data?.stubSerial === serial1, 'Decoded serial matches original serial');
  assert(verify1.data?.slotNumber === slot1, 'Decoded slot matches original slot');

  // Test 2: Tampered slot number rejection
  const tamperedSlotPayload = Buffer.from(`${serial1}|2|${generateStubSignature(serial1, slot1, TEST_SECRET)}`, 'utf8').toString('base64url');
  const verifyTamperedSlot = verifyStubPayload(tamperedSlotPayload, TEST_SECRET);
  assert(verifyTamperedSlot.isValid === false, 'Tampered slot number is rejected');

  // Test 3: Tampered serial rejection
  const tamperedSerialPayload = Buffer.from(`B27-B01-9999-S1|1|${generateStubSignature(serial1, slot1, TEST_SECRET)}`, 'utf8').toString('base64url');
  const verifyTamperedSerial = verifyStubPayload(tamperedSerialPayload, TEST_SECRET);
  assert(verifyTamperedSerial.isValid === false, 'Tampered stub serial is rejected');

  // Test 4: Mismatched signature length guard (Lesson 1.1)
  const shortSigPayload = Buffer.from(`${serial1}|1|short`, 'utf8').toString('base64url');
  const verifyShort = verifyStubPayload(shortSigPayload, TEST_SECRET);
  assert(verifyShort.isValid === false, 'Short signature is safely rejected without TypeError exception');

  const longSigPayload = Buffer.from(`${serial1}|1|a_very_long_invalid_signature_that_exceeds_normal_length`, 'utf8').toString('base64url');
  const verifyLong = verifyStubPayload(longSigPayload, TEST_SECRET);
  assert(verifyLong.isValid === false, 'Long signature is safely rejected without TypeError exception');

  // Test 5: Completely garbage / malformed payload
  const garbagePayload = 'not_a_valid_base64_payload_%%%';
  const verifyGarbage = verifyStubPayload(garbagePayload, TEST_SECRET);
  assert(verifyGarbage.isValid === false, 'Malformed string returns false gracefully');

  // Test 6: Trailing characters in slot (SEC-13)
  const trailingSlotPayload = Buffer.from(`${serial1}|1abc|${generateStubSignature(serial1, 1, TEST_SECRET)}`, 'utf8').toString('base64url');
  const verifyTrailingSlot = verifyStubPayload(trailingSlotPayload, TEST_SECRET);
  assert(verifyTrailingSlot.isValid === false, 'Trailing characters in slot number rejected by strict regex');

  console.log(`\nResults: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runCryptoTests();
