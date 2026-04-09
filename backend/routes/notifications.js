import express from 'express';
import { deleteNotification, getNotifications, markAsRead } from '../controllers/NotificationController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET /api/notifications - Get user's notifications
router.get('/notifications', authenticateToken, getNotifications);

// PUT /api/notifications/:id/read - Mark notification as read
router.put('/notifications/:id/read', authenticateToken, markAsRead);

// DELETE /api/notifications/:id - Delete a notification
router.delete('/notifications/:id', authenticateToken, deleteNotification);

export default router;
