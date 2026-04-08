import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { sendEmail } from '../services/emailService.js';
import { sendSms } from '../services/smsService.js';
import { createOtpForUser, verifyOtpForUser } from '../services/otpService.js';
import Phone from '../models/Phone.js';
import AccountAppeal from '../models/AccountAppeal.js';
import webSocketManager from '../websocket/WebSocketManager.js';
import { clearExpiredPostingRestriction, serializePostingRestriction } from '../utils/moderation.js';
import { pruneUserSavedContentReferences } from '../utils/savedContent.js';

function signAppealToken(userId) {
  return jwt.sign(
    { userId, purpose: 'account-appeal' },
    process.env.JWT_SECRET,
    { expiresIn: '30m' }
  );
}

function buildPendingLoginNotice(user) {
  if (!user.pendingLoginNoticeType || !user.pendingLoginNoticeTitle || !user.pendingLoginNoticeMessage) {
    return null;
  }

  return {
    type: user.pendingLoginNoticeType,
    title: user.pendingLoginNoticeTitle,
    message: user.pendingLoginNoticeMessage
  };
}

// Register a new user
export async function register(req, res) {
  try {
    const { username, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      const field = existingUser.email === email ? 'email' : 'username';
      return res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_ERROR',
          message: `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`,
          field
        }
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const user = new User({
      username,
      email,
      password: hashedPassword,
      role: 'user'
    });

    await user.save();

    // Create verification OTP and send to user's email
    try {
      const { code } = await createOtpForUser(user._id, 'verify');
      const subject = 'Verify your email';
      const text = `Your verification code is: ${code}. It expires in 15 minutes.`;
      const html = `<p>Your verification code is: <strong>${code}</strong></p><p>This code expires in 15 minutes.</p>`;

      await sendEmail({ to: user.email, subject, text, html });
    } catch (emailError) {
      // Log error but allow registration to succeed
      console.error('[auth] Failed to send verification email:', emailError);
    }

    return res.status(201).json({
      success: true,
      message: 'User registered successfully. A verification code was sent to your email.',
      data: {
        userId: user._id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

// Resend verification OTP
export async function resendVerificationOtp(req, res) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Email is required', field: 'email' } });
    }

    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal whether email exists
      return res.status(200).json({ success: true, message: 'If an account exists, a verification code was sent.' });
    }

    if (user.isVerified) {
      return res.status(400).json({ success: false, error: { code: 'ALREADY_VERIFIED', message: 'Email is already verified' } });
    }

    const { code } = await createOtpForUser(user._id, 'verify');
    const subject = 'Verify your email';
    const text = `Your verification code is: ${code}. It expires in 15 minutes.`;
    const html = `<p>Your verification code is: <strong>${code}</strong></p><p>This code expires in 15 minutes.</p>`;

    try {
      await sendEmail({ to: user.email, subject, text, html });
    } catch (emailError) {
      console.error('[auth] Failed to send verification email:', emailError);
    }

    return res.status(200).json({ success: true, message: 'Verification code sent if the email exists.' });
  } catch (error) {
    console.error('resendVerificationOtp error:', error);
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
  }
}

// Resend phone verification OTP (by phone number)
export async function resendPhoneVerification(req, res) {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'phoneNumber is required', field: 'phoneNumber' } });
    }

    const normalized = String(phoneNumber).replace(/[^+\d]/g, '');
    const user = await User.findOne({ phoneNumber: normalized });

    if (!user) {
      // Don't reveal existence
      return res.status(200).json({ success: true, message: 'If an account exists, a verification code was sent.' });
    }

    const { code } = await createOtpForUser(user._id, 'verify');
    const message = `Your verification code is: ${code}. It expires in 15 minutes.`;

    try {
      await sendSms({ to: normalized, body: message });
    } catch (smsError) {
      console.error('[auth] Failed to send verification SMS:', smsError);
    }

    return res.status(200).json({ success: true, message: 'Verification code sent if the phone exists.' });
  } catch (error) {
    console.error('resendPhoneVerification error:', error);
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
  }
}

// Verify phone OTP
export async function verifyPhoneOtp(req, res) {
  try {
    const { phoneNumber, code } = req.body;
    if (!phoneNumber || !code) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'phoneNumber and code are required' } });
    }

    const normalized = String(phoneNumber).replace(/[^+\d]/g, '');
    const user = await User.findOne({ phoneNumber: normalized });

    if (!user) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'Invalid phone number or code' } });
    }

    const ok = await verifyOtpForUser(user._id, 'verify', code);
    if (!ok) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_CODE', message: 'Invalid or expired verification code' } });
    }

    user.phoneVerified = true;
    await user.save();

    // mark phone history as verified
    try {
      await Phone.updateMany({ user: user._id, normalized }, { $set: { verified: true } });
    } catch (e) {
      // ignore
    }

    return res.status(200).json({ success: true, message: 'Phone verified successfully' });
  } catch (error) {
    console.error('verifyPhoneOtp error:', error);
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
  }
}

// Verify email with OTP
export async function verifyEmailOtp(req, res) {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Email and code are required' } });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'Invalid email or code' } });
    }

    const ok = await verifyOtpForUser(user._id, 'verify', code);
    if (!ok) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_CODE', message: 'Invalid or expired verification code' } });
    }

    user.isVerified = true;
    await user.save();

    return res.status(200).json({ success: true, message: 'Email verified successfully' });
  } catch (error) {
    console.error('verifyEmailOtp error:', error);
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
  }
}

// Request password reset (send OTP)
export async function requestPasswordReset(req, res) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Email is required' } });
    }

    const user = await User.findOne({ email });
    if (!user) {
      // Always return success to avoid leaking account existence
      return res.status(200).json({ success: true, message: 'If an account exists, a reset code was sent.' });
    }

    const { code } = await createOtpForUser(user._id, 'reset');
    const subject = 'Password reset code';
    const text = `Your password reset code is: ${code}. It expires in 15 minutes.`;
    const html = `<p>Your password reset code is: <strong>${code}</strong></p><p>This code expires in 15 minutes.</p>`;

    try {
      await sendEmail({ to: user.email, subject, text, html });
    } catch (emailError) {
      console.error('[auth] Failed to send password reset email:', emailError);
    }

    return res.status(200).json({ success: true, message: 'If an account exists, a reset code was sent.' });
  } catch (error) {
    console.error('requestPasswordReset error:', error);
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
  }
}

// Reset password using OTP
export async function resetPasswordWithOtp(req, res) {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Email, code and newPassword are required' } });
    }

    if (String(newPassword).length < 8) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Password must be at least 8 characters long', field: 'newPassword' } });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'Invalid email or code' } });
    }

    const ok = await verifyOtpForUser(user._id, 'reset', code);
    if (!ok) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_CODE', message: 'Invalid or expired reset code' } });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    return res.status(200).json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('resetPasswordWithOtp error:', error);
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
  }
}

// Login user
export async function login(req, res) {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Invalid email or password'
        }
      });
    }

    // Compare password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Invalid email or password'
        }
      });
    }

    await clearExpiredPostingRestriction(user);

    if (user.accountStatus === 'permanently-banned') {
      const latestAppeal = await AccountAppeal.findOne({ user: user._id })
        .sort({ updatedAt: -1, createdAt: -1 })
        .select('status appealReason evidence reviewReason reviewedAt createdAt');

      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_BANNED_PERMANENT',
          message: `This account has been permanently banned. Reason: ${user.permanentBanReason}`
        },
        data: {
          userId: user._id,
          username: user.username,
          email: user.email,
          permanentBanReason: user.permanentBanReason,
          permanentlyBannedAt: user.permanentlyBannedAt,
          appealToken: signAppealToken(user._id),
          latestAppeal
        }
      });
    }

    const loginNotice = buildPendingLoginNotice(user);
    const sanitizedCollections = await pruneUserSavedContentReferences(user);

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const responsePayload = {
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          role: user.role,
          isVerified: user.isVerified,
          avatar: user.avatar,
          bio: user.bio,
          likes: sanitizedCollections.likes,
          bookmarks: sanitizedCollections.bookmarks,
          favoriteTags: Array.isArray(user.favoriteTags) ? user.favoriteTags : [],
          accountStatus: user.accountStatus,
          ...serializePostingRestriction(user)
        },
        loginNotice
      }
    };

    if (loginNotice) {
      user.pendingLoginNoticeType = null;
      user.pendingLoginNoticeTitle = '';
      user.pendingLoginNoticeMessage = '';
      await user.save();
    }

    return res.status(200).json(responsePayload);
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

export async function submitAccountAppeal(req, res) {
  try {
    const { appealToken, reason, evidence } = req.body;

    if (!appealToken || !String(reason || '').trim()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Appeal token and appeal reason are required'
        }
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(appealToken, process.env.JWT_SECRET);
    } catch (verifyError) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'This appeal session has expired. Please sign in again.'
        }
      });
    }

    if (decoded.purpose !== 'account-appeal') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Invalid appeal session'
        }
      });
    }

    const user = await User.findById(decoded.userId);

    if (!user || user.accountStatus !== 'permanently-banned') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'This account is not currently permanently banned'
        }
      });
    }

    const existingPendingAppeal = await AccountAppeal.findOne({
      user: user._id,
      status: 'pending'
    });

    if (existingPendingAppeal) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_ERROR',
          message: 'You already have a pending appeal under review'
        },
        data: existingPendingAppeal
      });
    }

    const appeal = await AccountAppeal.create({
      user: user._id,
      banReason: user.permanentBanReason,
      bannedAt: user.permanentlyBannedAt,
      appealReason: String(reason).trim(),
      evidence: String(evidence || '').trim()
    });

    const admins = await User.find({ role: 'admin' }).select('_id');
    await Promise.all(
      admins.map((admin) => webSocketManager.sendNotification(admin._id, {
        recipient: admin._id,
        type: 'comment',
        from: user._id,
        contentId: null,
        contentType: null,
        message: `${user.username} submitted an account appeal for admin review.`
      }))
    );

    return res.status(201).json({
      success: true,
      message: 'Appeal submitted successfully',
      data: appeal
    });
  } catch (error) {
    console.error('Submit account appeal error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

// Logout (client-side token removal)
export function logout(req, res) {
  return res.status(200).json({
    success: true,
    message: 'Logout successful'
  });
}
