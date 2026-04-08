import express from 'express';
import { getProfile, updateAvatar, followUser, unfollowUser, updateProfile, getFollowers, getFollowing, getReadingHistory, getBookmarkedContent, getLikedContent, getFavoriteTags, addFavoriteTag, removeFavoriteTag, searchCreators, updatePhoneNumber } from '../controllers/UserController.js';
import { rateLimitSmsSend } from '../middleware/rateLimit.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { cacheResponse } from '../middleware/cacheResponse.js';
import { rateLimitRead, rateLimitSearch } from '../middleware/rateLimit.js';
import { CACHE_NAMESPACES } from '../services/cacheStore.js';
import { validateProfileUpdate } from '../middleware/validation.js';
import upload from '../middleware/upload.js';

const router = express.Router();

// GET /api/users/search - Search creators with normalized and fuzzy matching
router.get(
	'/users/search',
	optionalAuth,
	rateLimitSearch,
	cacheResponse({
		namespace: CACHE_NAMESPACES.CREATOR_SEARCH,
		ttlSeconds: 60,
		shouldCache: (req) => !req.user
	}),
	searchCreators
);

// GET /api/users/:id - Get user profile (optional auth to check if following)
router.get(
	'/users/:id',
	optionalAuth,
	rateLimitRead,
	cacheResponse({
		namespace: CACHE_NAMESPACES.PUBLIC_PROFILE,
		ttlSeconds: 45,
		shouldCache: (req) => !req.user
	}),
	getProfile
);

// PUT /api/users/profile - Update own profile
router.put('/users/profile', authenticateToken, validateProfileUpdate, updateProfile);

// PUT /api/users/avatar - Update avatar (with file upload support)
router.put('/users/avatar', authenticateToken, upload.single('avatar'), updateAvatar);

// PATCH /api/users/me/phone - Update phone number and send verification OTP
router.patch('/users/me/phone', authenticateToken, rateLimitSmsSend, updatePhoneNumber);

// GET /api/users/me/history - Get own reading history
router.get('/users/me/history', authenticateToken, getReadingHistory);

// GET /api/users/me/bookmarks - Get own bookmarked content
router.get('/users/me/bookmarks', authenticateToken, getBookmarkedContent);

// GET /api/users/me/likes - Get own liked content
router.get('/users/me/likes', authenticateToken, getLikedContent);

// GET /api/users/me/favorite-tags - Get own favorite hashtags
router.get('/users/me/favorite-tags', authenticateToken, getFavoriteTags);

// POST /api/users/me/favorite-tags - Save a favorite hashtag
router.post('/users/me/favorite-tags', authenticateToken, addFavoriteTag);

// DELETE /api/users/me/favorite-tags/:tag - Remove a favorite hashtag
router.delete('/users/me/favorite-tags/:tag', authenticateToken, removeFavoriteTag);

// POST /api/users/:id/follow - Follow user
router.post('/users/:id/follow', authenticateToken, followUser);

// DELETE /api/users/:id/follow - Unfollow user
router.delete('/users/:id/follow', authenticateToken, unfollowUser);

// GET /api/users/:id/followers - Get followers list
router.get('/users/:id/followers', rateLimitRead, getFollowers);

// GET /api/users/:id/following - Get following list
router.get('/users/:id/following', rateLimitRead, getFollowing);

export default router;
