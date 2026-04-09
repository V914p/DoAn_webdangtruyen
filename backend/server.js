import { createServer } from 'http';
import app from './app.js';
import { env, validateEnvironment } from './config/env.js';
import { connectToDatabase, disconnectFromDatabase } from './config/database.js';
import { initializeCache, shutdownCache } from './services/cacheStore.js';
import { startPermanentBanCleanupScheduler, stopPermanentBanCleanupScheduler } from './services/permanentBanCleanup.js';
import webSocketManager from './websocket/WebSocketManager.js';

let server;
let isShuttingDown = false;

async function shutdown(signal, error = null) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  const exitCode = error ? 1 : 0;

  if (error) {
    console.error(`[server] ${signal}:`, error);
  } else {
    console.log(`[server] Received ${signal}. Shutting down gracefully...`);
  }

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((closeError) => {
          if (closeError) {
            reject(closeError);
            return;
          }

          resolve();
        });
      });
    }
  } catch (closeError) {
    console.error('[server] HTTP server shutdown error:', closeError);
  }

  try {
    await disconnectFromDatabase();
  } catch (disconnectError) {
    console.error('[server] Database shutdown error:', disconnectError);
  }

  try {
    await shutdownCache();
  } catch (cacheError) {
    console.error('[server] Cache shutdown error:', cacheError);
  }

  stopPermanentBanCleanupScheduler();

  process.exit(exitCode);
}

async function startServer() {
  validateEnvironment({ requireDatabase: true });
  await connectToDatabase();
  await initializeCache();

  server = createServer(app);
  webSocketManager.initialize(server);
  startPermanentBanCleanupScheduler();

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(env.port, () => {
      server.off('error', reject);
      console.log(`Server running on port ${env.port}`);
      resolve();
    });
  });
}

process.on('SIGINT', () => {
  shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});

process.on('unhandledRejection', (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  shutdown('unhandledRejection', error);
});

process.on('uncaughtException', (error) => {
  shutdown('uncaughtException', error);
});

startServer().catch((error) => {
  shutdown('startup failure', error);
});

export default app;
