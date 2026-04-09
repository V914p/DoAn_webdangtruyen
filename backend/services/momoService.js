import crypto from 'crypto';
import { env } from '../config/env.js';

function toMomoString(value) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value);
}

function signRawSignature(rawSignature) {
  return crypto
    .createHmac('sha256', env.momo.secretKey || '')
    .update(rawSignature)
    .digest('hex');
}

export function buildCreatePaymentSignatureString({
  accessKey,
  amount,
  extraData,
  ipnUrl,
  orderId,
  orderInfo,
  partnerCode,
  redirectUrl,
  requestId,
  requestType
}) {
  return [
    `accessKey=${toMomoString(accessKey)}`,
    `amount=${toMomoString(amount)}`,
    `extraData=${toMomoString(extraData)}`,
    `ipnUrl=${toMomoString(ipnUrl)}`,
    `orderId=${toMomoString(orderId)}`,
    `orderInfo=${toMomoString(orderInfo)}`,
    `partnerCode=${toMomoString(partnerCode)}`,
    `redirectUrl=${toMomoString(redirectUrl)}`,
    `requestId=${toMomoString(requestId)}`,
    `requestType=${toMomoString(requestType)}`
  ].join('&');
}

export function signCreatePaymentPayload(payload) {
  const rawSignature = buildCreatePaymentSignatureString(payload);
  return signRawSignature(rawSignature);
}

export function buildMomoCreatePaymentPayload({
  orderId,
  requestId,
  amount,
  orderInfo,
  extraData = '',
  returnUrl = env.momo.returnUrl,
  notifyUrl = env.momo.notifyUrl,
  requestType = 'captureWallet',
  lang = 'vi'
}) {
  const payloadForSignature = {
    accessKey: env.momo.accessKey,
    amount,
    extraData,
    ipnUrl: notifyUrl,
    orderId,
    orderInfo,
    partnerCode: env.momo.partnerCode,
    redirectUrl: returnUrl,
    requestId,
    requestType
  };

  const signature = signCreatePaymentPayload(payloadForSignature);

  return {
    partnerCode: env.momo.partnerCode,
    accessKey: env.momo.accessKey,
    requestId: toMomoString(requestId),
    amount: toMomoString(amount),
    orderId: toMomoString(orderId),
    orderInfo: toMomoString(orderInfo),
    redirectUrl: toMomoString(returnUrl),
    ipnUrl: toMomoString(notifyUrl),
    requestType: toMomoString(requestType),
    extraData: toMomoString(extraData),
    lang: toMomoString(lang),
    autoCapture: true,
    signature
  };
}

export function buildCallbackSignatureString(payload) {
  return [
    `accessKey=${toMomoString(env.momo.accessKey)}`,
    `amount=${toMomoString(payload.amount)}`,
    `extraData=${toMomoString(payload.extraData)}`,
    `message=${toMomoString(payload.message)}`,
    `orderId=${toMomoString(payload.orderId)}`,
    `orderInfo=${toMomoString(payload.orderInfo)}`,
    `orderType=${toMomoString(payload.orderType)}`,
    `partnerCode=${toMomoString(payload.partnerCode)}`,
    `payType=${toMomoString(payload.payType)}`,
    `requestId=${toMomoString(payload.requestId)}`,
    `responseTime=${toMomoString(payload.responseTime)}`,
    `resultCode=${toMomoString(payload.resultCode)}`,
    `transId=${toMomoString(payload.transId)}`
  ].join('&');
}

export function verifyMomoCallbackSignature(payload) {
  if (!payload?.signature) {
    return false;
  }

  const rawSignature = buildCallbackSignatureString(payload);
  const expectedSignature = signRawSignature(rawSignature);
  return expectedSignature === payload.signature;
}

export function verifyMomoCreateResponseSignature(payload) {
  if (!payload?.signature) {
    return true;
  }

  return verifyMomoCallbackSignature(payload);
}
