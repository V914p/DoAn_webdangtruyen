import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { getDatabaseStatus } from './config/database.js';
import { ensureUploadsDirectory, uploadsDir } from './config/paths.js';
import { getCacheStatus } from './services/cacheStore.js';
import authRoutes from './routes/auth.js';
import contentRoutes from './routes/content.js';
import moderationRoutes from './routes/moderation.js';
import commentsRoutes from './routes/comments.js';
import reportsRoutes from './routes/reports.js';
import usersRoutes from './routes/users.js';
import notificationsRoutes from './routes/notifications.js';
import paymentsRoutes from './routes/payments.js';

const app = express();

ensureUploadsDirectory();

app.set('trust proxy', env.trustProxy);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadsDir));

app.use('/api/auth', authRoutes);
app.use('/api', contentRoutes);
app.use('/api/admin', moderationRoutes);
app.use('/api', commentsRoutes);
app.use('/api', reportsRoutes);
app.use('/api', usersRoutes);
app.use('/api', notificationsRoutes);
app.use('/api', paymentsRoutes);

app.get('/health', (req, res) => {
  const database = getDatabaseStatus();
  const cache = getCacheStatus();
  const isHealthy = database.status === 'connected';

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'degraded',
    message: isHealthy ? 'Server is running' : 'Database is not connected',
    uptimeSeconds: Math.round(process.uptime()),
    database,
    cache
  });
});

export default app;