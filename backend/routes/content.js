import express from 'express';
import { createStory, createArtwork, getContent, getHomeFeed, searchContent, getTrending, getPopularCreators, getRecommendedTags, getTrendingTags, getTagDirectory, toggleLike, toggleBookmark, deleteContent, updateContent } from '../controllers/ContentController.js';
import { authenticateToken, optionalAuth, requirePostingAccess } from '../middleware/auth.js';
import { cacheResponse } from '../middleware/cacheResponse.js';
import { validateStory, validateArtwork } from '../middleware/validation.js';
import { rateLimitContent, rateLimitRead, rateLimitSearch } from '../middleware/rateLimit.js';
import upload from '../middleware/upload.js';
import { CACHE_NAMESPACES } from '../services/cacheStore.js';

const router = express.Router();

// POST /api/stories - Create new story (optional image upload support)
router.post('/stories', authenticateToken, requirePostingAccess, rateLimitContent, upload.array('images', 10), validateStory, createStory);

// POST /api/artworks - Create new artwork (with file upload support)
router.post('/artworks', authenticateToken, requirePostingAccess, rateLimitContent, upload.array('images', 10), validateArtwork, createArtwork);

// GET /api/content/search - Search content
router.get(
	'/content/search',
	optionalAuth,
	rateLimitSearch,
	cacheResponse({
		namespace: CACHE_NAMESPACES.CONTENT_DISCOVERY,
		ttlSeconds: 45,
		shouldCache: (req) => !req.user && !req.query.status
	}),
	searchContent
);

// GET /api/content/feed - Cursor-paginated home feed
router.get(
	'/content/feed',
	optionalAuth,
	rateLimitRead,
	cacheResponse({
		namespace: CACHE_NAMESPACES.CONTENT_DISCOVERY,
		ttlSeconds: 30
	}),
	getHomeFeed
);

// GET /api/content/trending - Get trending content
router.get(
	'/content/trending',
	rateLimitRead,
	cacheResponse({
		namespace: CACHE_NAMESPACES.CONTENT_DISCOVERY,
		ttlSeconds: 90
	}),
	getTrending
);

// GET /api/content/creators/popular - Get creators ranked by total likes across approved posts
router.get(
	'/content/creators/popular',
	rateLimitRead,
	cacheResponse({
		namespace: CACHE_NAMESPACES.CONTENT_DISCOVERY,
		ttlSeconds: 120
	}),
	getPopularCreators
);

// GET /api/content/tags/recommended - Get personalized recommended hashtags from favorite tags
router.get('/content/tags/recommended', authenticateToken, rateLimitRead, getRecommendedTags);

// GET /api/content/tags/trending - Get trending hashtag stats
router.get(
	'/content/tags/trending',
	rateLimitRead,
	cacheResponse({
		namespace: CACHE_NAMESPACES.CONTENT_DISCOVERY,
		ttlSeconds: 180
	}),
	getTrendingTags
);

// GET /api/content/tags - Get hashtag directory and search results
router.get(
	'/content/tags',
	rateLimitSearch,
	cacheResponse({
		namespace: CACHE_NAMESPACES.CONTENT_DISCOVERY,
		ttlSeconds: 180
	}),
	getTagDirectory
);

// GET /api/content/:id - Get content by ID
router.get('/content/:id', optionalAuth, rateLimitRead, getContent);

// PUT /api/content/:id - Update content (story or artwork)
router.put('/content/:id', authenticateToken, requirePostingAccess, rateLimitContent, upload.array('images', 10), updateContent);

// POST /api/content/:id/like - Toggle like on content
router.post('/content/:id/like', authenticateToken, toggleLike);

// POST /api/content/:id/bookmark - Toggle bookmark on content
router.post('/content/:id/bookmark', authenticateToken, toggleBookmark);

// DELETE /api/content/:id - Delete content (soft delete)
router.delete('/content/:id', authenticateToken, deleteContent);

export default router;
