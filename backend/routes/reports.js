import express from 'express';
import { createReport } from '../controllers/ReportController.js';
import { authenticateToken } from '../middleware/auth.js';
import { validateReport } from '../middleware/validation.js';

const router = express.Router();

// POST /api/reports - Create report
router.post('/reports', authenticateToken, validateReport, createReport);

export default router;
