import crypto from 'crypto';

// Validates the X-Twilio-Signature header on incoming webhook requests.
// Twilio signs every POST with HMAC-SHA1(authToken, url + sortedBodyParams).
// Returns false (not 403) — callers decide the response.
export function validateTwilioSignature(authToken, twilioSignature, url, params) {
  if (!authToken || !twilioSignature) return false;
  const sortedKeys = Object.keys(params).sort();
  const str = url + sortedKeys.reduce((acc, k) => acc + k + (params[k] ?? ''), '');
  const expected = crypto.createHmac('sha1', authToken).update(str, 'utf8').digest('base64');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'utf8'),
      Buffer.from(twilioSignature, 'utf8')
    );
  } catch {
    return false;
  }
}
