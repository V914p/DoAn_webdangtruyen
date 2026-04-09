import express from 'express';
import {
  confirmPaymentFromReturnDev,
  createMomoPremiumCheckout,
  createMomoSubscriptionCheckout,
  getPaymentStatus,
  handleMomoIpn,
  handleMomoReturn
} from '../controllers/PaymentController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// POST /api/payments/momo/subscriptions/:artistId/create
router.post('/payments/momo/subscriptions/:artistId/create', authenticateToken, createMomoSubscriptionCheckout);

// POST /api/payments/momo/premium/create
router.post('/payments/momo/premium/create', authenticateToken, createMomoPremiumCheckout);

// POST /api/payments/momo/ipn
router.post('/payments/momo/ipn', handleMomoIpn);

// GET /api/payments/momo/return
router.get('/payments/momo/return', handleMomoReturn);

// GET /api/payments/:orderId/status
router.get('/payments/:orderId/status', authenticateToken, getPaymentStatus);

// POST /api/payments/:orderId/confirm-from-return-dev
router.post('/payments/:orderId/confirm-from-return-dev', authenticateToken, confirmPaymentFromReturnDev);

export default router;
