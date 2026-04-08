import express from 'express';
import { register, login, logout, submitAccountAppeal, resendVerificationOtp, verifyEmailOtp, requestPasswordReset, resetPasswordWithOtp, resendPhoneVerification, verifyPhoneOtp } from '../controllers/AuthController.js';
import { rateLimitSmsSend, rateLimitSmsVerify } from '../middleware/rateLimit.js';
import { rateLimitAuth } from '../middleware/rateLimit.js';
import { validateRegistration } from '../middleware/validation.js';

const router = express.Router();

// POST /api/auth/register - Register new user
router.post('/register', rateLimitAuth, validateRegistration, register);

// POST /api/auth/login - Login user
router.post('/login', rateLimitAuth, login);

// POST /api/auth/logout - Logout user (client-side token removal)
router.post('/logout', logout);

// POST /api/auth/account-appeals - Submit an appeal for a permanently banned account
router.post('/account-appeals', rateLimitAuth, submitAccountAppeal);

// Email verification & password reset
router.post('/verify-email', rateLimitAuth, verifyEmailOtp);
router.post('/resend-verification', rateLimitAuth, resendVerificationOtp);
router.post('/resend-phone-verification', rateLimitAuth, rateLimitSmsSend, resendPhoneVerification);
router.post('/verify-phone', rateLimitAuth, rateLimitSmsVerify, verifyPhoneOtp);
router.post('/request-password-reset', rateLimitAuth, requestPasswordReset);
router.post('/reset-password', rateLimitAuth, resetPasswordWithOtp);

export default router;
