import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { clearExpiredPostingRestriction, getActivePostingRestriction } from '../utils/moderation.js';

// Middleware to verify JWT token and attach user to request
export function authenticateToken(req, res, next) {
  // Get token from Authorization header
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'AUTH_ERROR',
        message: 'Access token required'
      }
    });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    User.findById(decoded.userId)
      .select('role accountStatus permanentBanReason permanentlyBannedAt postingRestrictedUntil postingRestrictionReason postingRestrictionSource')
      .then((user) => {
        if (!user) {
          return res.status(401).json({
            success: false,
            error: {
              code: 'AUTH_ERROR',
              message: 'Invalid or expired token'
            }
          });
        }

        if (user.accountStatus === 'permanently-banned') {
          return res.status(403).json({
            success: false,
            error: {
              code: 'ACCOUNT_BANNED_PERMANENT',
              message: `This account has been permanently banned. Reason: ${user.permanentBanReason}`
            },
            data: {
              userId: user._id,
              permanentBanReason: user.permanentBanReason,
              permanentlyBannedAt: user.permanentlyBannedAt
            }
          });
        }

        req.user = {
          userId: user._id.toString(),
          role: user.role,
          accountStatus: user.accountStatus,
          postingRestrictedUntil: user.postingRestrictedUntil,
          postingRestrictionReason: user.postingRestrictionReason,
          postingRestrictionSource: user.postingRestrictionSource
        };

        return next();
      })
      .catch(() => {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_ERROR',
            message: 'Invalid or expired token'
          }
        });
      });
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'AUTH_ERROR',
        message: 'Invalid or expired token'
      }
    });
  }
}

// Optional authentication - attach user if token is valid, but don't require it
export function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
    } catch (error) {
      // Token invalid, but we don't fail - just continue without user
      req.user = null;
    }
  }
  
  next();
}

// Middleware to check if user has admin role
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Admin role required for this action'
      }
    });
  }
  next();
}

export async function requirePostingAccess(req, res, next) {
  try {
    const user = await User.findById(req.user?.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'User not found'
        }
      });
    }

    await clearExpiredPostingRestriction(user);

    if (user.accountStatus === 'permanently-banned') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_BANNED_PERMANENT',
          message: `This account has been permanently banned. Reason: ${user.permanentBanReason}`
        },
        data: {
          permanentBanReason: user.permanentBanReason,
          permanentlyBannedAt: user.permanentlyBannedAt
        }
      });
    }

    const restriction = getActivePostingRestriction(user);

    if (!restriction) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: {
        code: 'POSTING_RESTRICTED',
        message: `Your posting access is suspended until ${restriction.until.toLocaleString()} because: ${restriction.reason}`
      },
      data: {
        postingRestrictedUntil: restriction.until,
        postingRestrictionReason: restriction.reason,
        postingRestrictionSource: restriction.source,
        isPostingRestricted: true
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}
