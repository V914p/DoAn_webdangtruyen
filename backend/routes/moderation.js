import express from 'express';
import { dismissReports, banContent, getReports, getReportDetails, openReportIncident, releaseReportIncident, getUsersForModeration, banUser, permanentlyBanUser, unbanUser, getAccountAppeals, approveAccountAppeal, rejectAccountAppeal } from '../controllers/ModerationController.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// PUT /api/admin/content/:id/dismiss-reports - Dismiss all reports for a post
router.put('/content/:id/dismiss-reports', authenticateToken, requireAdmin, dismissReports);

// PUT /api/admin/content/:id/ban - Ban a reported post
router.put('/content/:id/ban', authenticateToken, requireAdmin, banContent);

// GET /api/admin/reports - Get all reports
router.get('/reports', authenticateToken, requireAdmin, getReports);

// GET /api/admin/reports/:contentType/:id - Get paginated report details for one post
router.get('/reports/:contentType/:id', authenticateToken, requireAdmin, getReportDetails);

// POST /api/admin/reports/:contentType/:id/open - Open an incident and auto-assign it to the current admin
router.post('/reports/:contentType/:id/open', authenticateToken, requireAdmin, openReportIncident);

// PUT /api/admin/reports/:contentType/:id/release - Release an incident currently assigned to the current admin
router.put('/reports/:contentType/:id/release', authenticateToken, requireAdmin, releaseReportIncident);

// GET /api/admin/users - Get users for admin moderation
router.get('/users', authenticateToken, requireAdmin, getUsersForModeration);

// PUT /api/admin/users/:id/ban - Suspend user posting access for 3 days
router.put('/users/:id/ban', authenticateToken, requireAdmin, banUser);

// PUT /api/admin/users/:id/permanent-ban - Permanently ban a user account
router.put('/users/:id/permanent-ban', authenticateToken, requireAdmin, permanentlyBanUser);

// PUT /api/admin/users/:id/unban - Clear user posting restriction
router.put('/users/:id/unban', authenticateToken, requireAdmin, unbanUser);

// GET /api/admin/appeals - Get account appeals
router.get('/appeals', authenticateToken, requireAdmin, getAccountAppeals);

// PUT /api/admin/appeals/:id/approve - Approve an appeal and unban the account
router.put('/appeals/:id/approve', authenticateToken, requireAdmin, approveAccountAppeal);

// PUT /api/admin/appeals/:id/reject - Reject an appeal with a reason
router.put('/appeals/:id/reject', authenticateToken, requireAdmin, rejectAccountAppeal);

export default router;
