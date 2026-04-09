import express from 'express';
import { createComment, getComments, deleteComment } from '../controllers/CommentController.js';
import { cacheResponse } from '../middleware/cacheResponse.js';
import { authenticateToken } from '../middleware/auth.js';
import { validateComment } from '../middleware/validation.js';
import { rateLimitComment, rateLimitRead } from '../middleware/rateLimit.js';
import { CACHE_NAMESPACES } from '../services/cacheStore.js';

const router = express.Router();

// POST /api/content/:id/comments - Create comment
router.post('/content/:id/comments', authenticateToken, rateLimitComment, validateComment, createComment);

// GET /api/content/:id/comments - Get comments
router.get(
	'/content/:id/comments',
	rateLimitRead,
	cacheResponse({
		namespace: CACHE_NAMESPACES.COMMENT_THREADS,
		ttlSeconds: 30
	}),
	getComments
);

// DELETE /api/comments/:id - Delete own comment
router.delete('/comments/:id', authenticateToken, deleteComment);

export default router;
