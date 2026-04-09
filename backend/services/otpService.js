import bcrypt from 'bcrypt';
import Otp from '../models/Otp.js';

function generateNumericOtp(length = 6) {
  const max = 10 ** length;
  const n = Math.floor(Math.random() * max);
  return String(n).padStart(length, '0');
}

export async function createOtpForUser(userId, type = 'verify', { length = 6, ttlMinutes = 15 } = {}) {
  const code = generateNumericOtp(length);
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  const otp = await Otp.create({
    user: userId,
    type,
    codeHash,
    expiresAt
  });

  return { otp, code };
}

export async function verifyOtpForUser(userId, type, code) {
  const otp = await Otp.findOne({ user: userId, type, used: false, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });

  if (!otp) return false;

  const valid = await bcrypt.compare(String(code), otp.codeHash);

  if (!valid) return false;

  otp.used = true;
  await otp.save();

  return true;
}
