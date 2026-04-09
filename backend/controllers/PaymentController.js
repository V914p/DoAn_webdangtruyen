import crypto from 'crypto';
import superagent from 'superagent';
import User from '../models/User.js';
import ArtistSubscription from '../models/ArtistSubscription.js';
import PaymentTransaction from '../models/PaymentTransaction.js';
import { env } from '../config/env.js';
import {
  buildMomoCreatePaymentPayload,
  verifyMomoCallbackSignature,
  verifyMomoCreateResponseSignature
} from '../services/momoService.js';

const SUBSCRIPTION_DURATION_DAYS = 30;
const PREMIUM_PLAN_PRICING = {
  monthly: 99000,
  yearly: 999000
};
const PREMIUM_PLAN_DURATION_DAYS = {
  monthly: 30,
  yearly: 365
};

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function buildOrderId() {
  const randomPart = crypto.randomBytes(4).toString('hex');
  return `MOMO_SUB_${Date.now()}_${randomPart}`;
}

function buildRequestId(orderId) {
  return `${orderId}_REQ`;
}

function resolvePaymentFailureStatus(resultCode) {
  if (String(resultCode) === '1006') {
    return 'cancelled';
  }

  return 'failed';
}

function hasMomoConfig() {
  return Boolean(
    env.momo.partnerCode
    && env.momo.accessKey
    && env.momo.secretKey
    && env.momo.endpoint
    && env.momo.returnUrl
    && env.momo.notifyUrl
  );
}

function normalizePremiumPlan(rawPlan) {
  const plan = String(rawPlan || '').trim().toLowerCase();
  if (plan === 'monthly' || plan === 'yearly') {
    return plan;
  }
  return '';
}

async function activateOrExtendSubscription({ subscriberId, artistId, amount }) {
  const now = new Date();
  const activeSubscription = await ArtistSubscription.findOne({
    subscriber: subscriberId,
    artist: artistId,
    status: 'active',
    expiresAt: { $gt: now }
  }).sort({ expiresAt: -1 });

  if (activeSubscription) {
    activeSubscription.expiresAt = addDays(activeSubscription.expiresAt, SUBSCRIPTION_DURATION_DAYS);
    activeSubscription.priceAtPurchase = amount;
    activeSubscription.status = 'active';
    await activeSubscription.save();
    return activeSubscription;
  }

  const existingSubscription = await ArtistSubscription.findOne({
    subscriber: subscriberId,
    artist: artistId
  }).sort({ updatedAt: -1, createdAt: -1 });

  if (existingSubscription) {
    existingSubscription.status = 'active';
    existingSubscription.startedAt = now;
    existingSubscription.expiresAt = addDays(now, SUBSCRIPTION_DURATION_DAYS);
    existingSubscription.priceAtPurchase = amount;
    await existingSubscription.save();
    return existingSubscription;
  }

  const newSubscription = new ArtistSubscription({
    subscriber: subscriberId,
    artist: artistId,
    priceAtPurchase: amount,
    status: 'active',
    startedAt: now,
    expiresAt: addDays(now, SUBSCRIPTION_DURATION_DAYS)
  });

  await newSubscription.save();
  return newSubscription;
}

async function activatePremiumForUser({ userId, plan }) {
  const user = await User.findById(userId);
  if (!user) {
    return null;
  }

  const now = new Date();
  const durationDays = PREMIUM_PLAN_DURATION_DAYS[plan] || PREMIUM_PLAN_DURATION_DAYS.monthly;

  user.creatorPlan = 'premium_artist';
  user.premiumStatus = 'active';
  user.premiumStartedAt = now;
  user.premiumExpiresAt = addDays(now, durationDays);
  await user.save();

  return user;
}

async function applySuccessfulPaymentTransaction(paymentTransaction) {
  if (paymentTransaction.transactionType === 'premium_artist_upgrade') {
    const plan = normalizePremiumPlan(paymentTransaction.metadata?.plan);
    const activatedUser = await activatePremiumForUser({
      userId: paymentTransaction.user,
      plan: plan || 'monthly'
    });

    if (!activatedUser) {
      return {
        success: false,
        error: {
          status: 404,
          code: 'NOT_FOUND',
          message: 'User not found'
        }
      };
    }

    paymentTransaction.expiresAt = activatedUser.premiumExpiresAt;
  } else {
    const subscription = await activateOrExtendSubscription({
      subscriberId: paymentTransaction.user,
      artistId: paymentTransaction.artist,
      amount: paymentTransaction.amount
    });

    paymentTransaction.subscription = subscription._id;
    paymentTransaction.expiresAt = subscription.expiresAt;
  }

  paymentTransaction.status = 'paid';
  paymentTransaction.paidAt = new Date();
  await paymentTransaction.save();

  return { success: true };
}

export async function createMomoSubscriptionCheckout(req, res) {
  try {
    if (!hasMomoConfig()) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'CONFIG_ERROR',
          message: 'MoMo payment configuration is incomplete'
        }
      });
    }

    const { artistId } = req.params;
    const userId = req.user.userId;

    if (String(artistId) === String(userId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Cannot subscribe to yourself'
        }
      });
    }

    const artist = await User.findById(artistId).select('username creatorPlan premiumStatus subscriptionEnabled subscriptionPrice');
    if (!artist) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Artist not found'
        }
      });
    }

    const isPremiumArtist = artist.creatorPlan === 'premium_artist' && artist.premiumStatus === 'active';
    if (!isPremiumArtist || !artist.subscriptionEnabled) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'SUBSCRIPTION_DISABLED',
          message: 'This artist does not offer subscriptions'
        }
      });
    }

    const existingActive = await ArtistSubscription.findOne({
      subscriber: userId,
      artist: artistId,
      status: 'active',
      expiresAt: { $gt: new Date() }
    });

    if (existingActive) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_ERROR',
          message: 'You already have an active subscription to this artist'
        }
      });
    }

    const amount = Number(artist.subscriptionPrice || 0);
    const orderId = buildOrderId();
    const requestId = buildRequestId(orderId);
    const orderInfo = `WebTruyen artist subscription: ${artist.username}`;

    const paymentTransaction = await PaymentTransaction.create({
      user: userId,
      artist: artistId,
      provider: 'momo',
      transactionType: 'artist_subscription',
      amount,
      currency: 'VND',
      orderId,
      requestId,
      status: 'pending',
      artistSnapshot: {
        username: artist.username,
        priceAtCheckout: amount
      },
      returnUrl: env.momo.returnUrl,
      notifyUrl: env.momo.notifyUrl
    });

    const payload = buildMomoCreatePaymentPayload({
      orderId,
      requestId,
      amount,
      orderInfo,
      returnUrl: env.momo.returnUrl,
      notifyUrl: env.momo.notifyUrl,
      requestType: env.momo.requestType || 'captureWallet',
      extraData: ''
    });

    const momoResponse = await superagent
      .post(env.momo.endpoint)
      .send(payload)
      .set('Content-Type', 'application/json')
      .timeout({ response: 15000, deadline: 20000 });

    const momoData = momoResponse.body || {};

    paymentTransaction.payUrl = momoData.payUrl || '';
    paymentTransaction.deeplink = momoData.deeplink || momoData.deeplinkMiniApp || '';
    paymentTransaction.qrCodeUrl = momoData.qrCodeUrl || '';
    paymentTransaction.rawCreateResponse = momoData;

    if (!verifyMomoCreateResponseSignature(momoData)) {
      paymentTransaction.status = 'failed';
      await paymentTransaction.save();

      return res.status(502).json({
        success: false,
        error: {
          code: 'INVALID_SIGNATURE',
          message: 'Invalid MoMo create-payment response signature'
        }
      });
    }

    if (String(momoData.resultCode) !== '0' || !momoData.payUrl) {
      paymentTransaction.status = 'failed';
      await paymentTransaction.save();

      return res.status(502).json({
        success: false,
        error: {
          code: 'PAYMENT_PROVIDER_ERROR',
          message: momoData.message || 'Failed to create MoMo checkout session'
        }
      });
    }

    await paymentTransaction.save();

    return res.status(201).json({
      success: true,
      message: 'MoMo checkout created successfully',
      data: {
        orderId,
        requestId,
        payUrl: paymentTransaction.payUrl,
        deeplink: paymentTransaction.deeplink,
        qrCodeUrl: paymentTransaction.qrCodeUrl
      }
    });
  } catch (error) {
    console.error('Create MoMo subscription checkout error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

export async function createMomoPremiumCheckout(req, res) {
  try {
    if (!hasMomoConfig()) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'CONFIG_ERROR',
          message: 'MoMo payment configuration is incomplete'
        }
      });
    }

    const userId = req.user.userId;
    const plan = normalizePremiumPlan(req.body?.plan);

    if (!plan) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Plan must be either monthly or yearly',
          field: 'plan'
        }
      });
    }

    const user = await User.findById(userId).select('username creatorPlan premiumStatus premiumExpiresAt');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'User not found'
        }
      });
    }

    const isCurrentlyPremium = user.creatorPlan === 'premium_artist'
      && user.premiumStatus === 'active'
      && user.premiumExpiresAt
      && new Date(user.premiumExpiresAt) > new Date();

    if (isCurrentlyPremium) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_ERROR',
          message: 'Your premium artist plan is already active'
        }
      });
    }

    const amount = PREMIUM_PLAN_PRICING[plan];
    const orderId = buildOrderId();
    const requestId = buildRequestId(orderId);
    const orderInfo = `WebTruyen premium artist upgrade (${plan})`;

    const paymentTransaction = await PaymentTransaction.create({
      user: userId,
      artist: userId,
      provider: 'momo',
      transactionType: 'premium_artist_upgrade',
      amount,
      currency: 'VND',
      orderId,
      requestId,
      status: 'pending',
      artistSnapshot: {
        username: user.username,
        priceAtCheckout: amount
      },
      metadata: {
        plan
      },
      returnUrl: env.momo.returnUrl,
      notifyUrl: env.momo.notifyUrl
    });

    const payload = buildMomoCreatePaymentPayload({
      orderId,
      requestId,
      amount,
      orderInfo,
      returnUrl: env.momo.returnUrl,
      notifyUrl: env.momo.notifyUrl,
      requestType: env.momo.requestType || 'captureWallet',
      extraData: plan
    });

    const momoResponse = await superagent
      .post(env.momo.endpoint)
      .send(payload)
      .set('Content-Type', 'application/json')
      .timeout({ response: 15000, deadline: 20000 });

    const momoData = momoResponse.body || {};

    paymentTransaction.payUrl = momoData.payUrl || '';
    paymentTransaction.deeplink = momoData.deeplink || momoData.deeplinkMiniApp || '';
    paymentTransaction.qrCodeUrl = momoData.qrCodeUrl || '';
    paymentTransaction.rawCreateResponse = momoData;

    if (!verifyMomoCreateResponseSignature(momoData)) {
      paymentTransaction.status = 'failed';
      await paymentTransaction.save();

      return res.status(502).json({
        success: false,
        error: {
          code: 'INVALID_SIGNATURE',
          message: 'Invalid MoMo create-payment response signature'
        }
      });
    }

    if (String(momoData.resultCode) !== '0' || !momoData.payUrl) {
      paymentTransaction.status = 'failed';
      await paymentTransaction.save();

      return res.status(502).json({
        success: false,
        error: {
          code: 'PAYMENT_PROVIDER_ERROR',
          message: momoData.message || 'Failed to create MoMo checkout session'
        }
      });
    }

    await paymentTransaction.save();

    return res.status(201).json({
      success: true,
      message: 'MoMo premium checkout created successfully',
      data: {
        orderId,
        requestId,
        plan,
        payUrl: paymentTransaction.payUrl,
        deeplink: paymentTransaction.deeplink,
        qrCodeUrl: paymentTransaction.qrCodeUrl
      }
    });
  } catch (error) {
    console.error('Create MoMo premium checkout error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

export async function handleMomoIpn(req, res) {
  try {
    const payload = req.body || {};
    const { orderId, requestId, resultCode, transId, amount } = payload;

    if (!orderId || !requestId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing orderId or requestId'
        }
      });
    }

    const paymentTransaction = await PaymentTransaction.findOne({ orderId });
    if (!paymentTransaction) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Payment transaction not found'
        }
      });
    }

    if (String(paymentTransaction.requestId) !== String(requestId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid requestId for this order'
        }
      });
    }

    if (!verifyMomoCallbackSignature(payload)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_SIGNATURE',
          message: 'Invalid MoMo signature'
        }
      });
    }

    const callbackAmount = Number(amount);
    if (!Number.isFinite(callbackAmount) || callbackAmount !== Number(paymentTransaction.amount)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'AMOUNT_MISMATCH',
          message: 'Payment amount does not match expected transaction amount'
        }
      });
    }

    if (paymentTransaction.status === 'paid') {
      return res.status(200).json({
        success: true,
        message: 'IPN already processed'
      });
    }

    paymentTransaction.rawCallbackPayload = payload;
    paymentTransaction.momoTransId = transId ? String(transId) : paymentTransaction.momoTransId;

    if (String(resultCode) !== '0') {
      paymentTransaction.status = resolvePaymentFailureStatus(resultCode);
      await paymentTransaction.save();

      return res.status(200).json({
        success: true,
        message: 'IPN processed'
      });
    }

    const applyResult = await applySuccessfulPaymentTransaction(paymentTransaction);
    if (!applyResult.success) {
      return res.status(applyResult.error.status).json({
        success: false,
        error: {
          code: applyResult.error.code,
          message: applyResult.error.message
        }
      });
    }

    return res.status(200).json({
      success: true,
      message: 'IPN processed'
    });
  } catch (error) {
    console.error('Handle MoMo IPN error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

export async function handleMomoReturn(req, res) {
  try {
    const { orderId, resultCode } = req.query;

    return res.status(200).json({
      success: true,
      data: {
        orderId: orderId || '',
        resultCode: resultCode || ''
      },
      message: 'Return received. Payment status must be confirmed by IPN.'
    });
  } catch (error) {
    console.error('Handle MoMo return error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

export async function getPaymentStatus(req, res) {
  try {
    const { orderId } = req.params;
    const userId = req.user.userId;

    const paymentTransaction = await PaymentTransaction.findOne({
      orderId,
      user: userId
    });

    if (!paymentTransaction) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Payment transaction not found'
        }
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        orderId: paymentTransaction.orderId,
        transactionType: paymentTransaction.transactionType,
        status: paymentTransaction.status,
        amount: paymentTransaction.amount,
        currency: paymentTransaction.currency,
        paidAt: paymentTransaction.paidAt,
        expiresAt: paymentTransaction.expiresAt,
        artistId: paymentTransaction.artist,
        subscriptionId: paymentTransaction.subscription,
        metadata: paymentTransaction.metadata || {}
      }
    });
  } catch (error) {
    console.error('Get payment status error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

export async function confirmPaymentFromReturnDev(req, res) {
  try {
    if (env.isProduction) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'This endpoint is disabled in production'
        }
      });
    }

    const { orderId } = req.params;
    const userId = req.user.userId;
    const resultCode = String(req.body?.resultCode || req.query?.resultCode || '');
    const message = String(req.body?.message || req.query?.message || '');

    if (resultCode !== '0') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Only successful return resultCode can be confirmed'
        }
      });
    }

    const paymentTransaction = await PaymentTransaction.findOne({
      orderId,
      user: userId
    });

    if (!paymentTransaction) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Payment transaction not found'
        }
      });
    }

    if (paymentTransaction.status === 'paid') {
      return res.status(200).json({
        success: true,
        message: 'Payment already confirmed',
        data: {
          orderId: paymentTransaction.orderId,
          status: paymentTransaction.status
        }
      });
    }

    paymentTransaction.rawCallbackPayload = {
      ...(paymentTransaction.rawCallbackPayload || {}),
      devReturnConfirm: true,
      resultCode,
      message,
      confirmedAt: new Date().toISOString()
    };
    paymentTransaction.momoTransId = paymentTransaction.momoTransId || `DEV_RETURN_${Date.now()}`;

    const applyResult = await applySuccessfulPaymentTransaction(paymentTransaction);
    if (!applyResult.success) {
      return res.status(applyResult.error.status).json({
        success: false,
        error: {
          code: applyResult.error.code,
          message: applyResult.error.message
        }
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Payment confirmed from return (development mode)'
    });
  } catch (error) {
    console.error('Confirm payment from return (dev) error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}
