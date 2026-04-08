import Twilio from 'twilio';
import { env } from '../config/env.js';

let twilioClient = null;
if (env.twilio.accountSid && env.twilio.authToken) {
  try {
    twilioClient = Twilio(env.twilio.accountSid, env.twilio.authToken);
  } catch (err) {
    // ignore
    twilioClient = null;
  }
}

export async function sendSms({ to, body }) {
  if (!twilioClient || !env.twilio.fromNumber) {
    // Fallback to console log for development
    // eslint-disable-next-line no-console
    console.log('[sms] Twilio not configured. SMS to:', to, 'body:', body);
    return Promise.resolve();
  }

  return twilioClient.messages.create({
    body,
    from: env.twilio.fromNumber,
    to
  });
}
