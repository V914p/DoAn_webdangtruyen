import { connectNotificationSocket, disconnectNotificationSocket } from './notificationService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const AUTH_USER_CHANGED_EVENT = 'auth-user-changed';
const LOGIN_NOTICE_KEY = 'post-login-notice';

function emitAuthUserChanged(user) {
  window.dispatchEvent(new CustomEvent(AUTH_USER_CHANGED_EVENT, {
    detail: user
  }));
}

export function setCurrentUser(user) {
  localStorage.setItem('user', JSON.stringify(user));
  emitAuthUserChanged(user);
}

export function subscribeToCurrentUserChange(callback) {
  const handleUserChanged = (event) => {
    callback(event.detail ?? getCurrentUser());
  };

  const handleStorage = (event) => {
    if (event.key === 'user') {
      callback(getCurrentUser());
    }
  };

  window.addEventListener(AUTH_USER_CHANGED_EVENT, handleUserChanged);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(AUTH_USER_CHANGED_EVENT, handleUserChanged);
    window.removeEventListener('storage', handleStorage);
  };
}

export function queuePostLoginNotice(notice) {
  if (!notice) return;
  sessionStorage.setItem(LOGIN_NOTICE_KEY, JSON.stringify(notice));
}

export function consumePostLoginNotice() {
  const raw = sessionStorage.getItem(LOGIN_NOTICE_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(LOGIN_NOTICE_KEY);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Login user
export async function login(email, password) {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  });

  const data = await response.json();

  if (data.success) {
    // Store token in localStorage
    localStorage.setItem('token', data.data.token);
    setCurrentUser(data.data.user);
    queuePostLoginNotice(data.data.loginNotice);
    connectNotificationSocket(data.data.token, { reason: 'login' });
  }

  return data;
}

export async function submitAccountAppeal(appealToken, reason, evidence = '') {
  const response = await fetch(`${API_URL}/api/auth/account-appeals`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      appealToken,
      reason,
      evidence
    })
  });

  return await response.json();
}

// Register user
export async function register(username, email, password) {
  const response = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, email, password })
  });

  return await response.json();
}

// Send verification OTP (resend)
export async function sendVerificationOtp(email) {
  const response = await fetch(`${API_URL}/api/auth/resend-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });

  return await response.json();
}

// Verify email OTP
export async function verifyEmailOtp(email, code) {
  const response = await fetch(`${API_URL}/api/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code })
  });

  return await response.json();
}

// Request password reset (send OTP)
export async function requestPasswordReset(email) {
  const response = await fetch(`${API_URL}/api/auth/request-password-reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });

  return await response.json();
}

// Reset password using OTP
export async function resetPassword(email, code, newPassword) {
  const response = await fetch(`${API_URL}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code, newPassword })
  });

  return await response.json();
}

// Update authenticated user's phone number (sends verification SMS)
export async function updatePhoneNumber(phoneNumber) {
  const response = await fetch(`${API_URL}/api/users/me/phone`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`
    },
    body: JSON.stringify({ phoneNumber })
  });

  return await response.json();
}

// Resend phone verification SMS
export async function resendPhoneVerification(phoneNumber) {
  const response = await fetch(`${API_URL}/api/auth/resend-phone-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber })
  });

  return await response.json();
}

// Verify phone OTP
export async function verifyPhone(phoneNumber, code) {
  const response = await fetch(`${API_URL}/api/auth/verify-phone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber, code })
  });

  return await response.json();
}

// Logout user
export function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  emitAuthUserChanged(null);
  disconnectNotificationSocket();
}

// Get token
export function getToken() {
  return localStorage.getItem('token');
}

// Get current user
export function getCurrentUser() {
  const userStr = localStorage.getItem('user');
  return userStr ? JSON.parse(userStr) : null;
}

export function updateCurrentUserCollection(collectionKey, contentId, shouldInclude) {
  const currentUser = getCurrentUser();

  if (!currentUser) {
    return null;
  }

  const normalizedId = String(contentId);
  const currentValues = Array.isArray(currentUser[collectionKey])
    ? currentUser[collectionKey].map((value) => String(value))
    : [];

  const nextValues = shouldInclude
    ? [...new Set([...currentValues, normalizedId])]
    : currentValues.filter((value) => value !== normalizedId);

  const nextUser = {
    ...currentUser,
    [collectionKey]: nextValues
  };

  setCurrentUser(nextUser);
  return nextUser;
}

export function updateCurrentUserFavoriteTags(favoriteTags) {
  const currentUser = getCurrentUser();

  if (!currentUser) {
    return null;
  }

  const nextUser = {
    ...currentUser,
    favoriteTags: Array.isArray(favoriteTags) ? favoriteTags : []
  };

  setCurrentUser(nextUser);
  return nextUser;
}

// Check if user is authenticated
export function isAuthenticated() {
  return !!getToken();
}
