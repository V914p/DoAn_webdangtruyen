import ModerationCase from '../models/ModerationCase.js';
import { connectToDatabase, disconnectFromDatabase } from '../config/database.js';
import { validateEnvironment } from '../config/env.js';

async function run() {
  validateEnvironment({ requireDatabase: true });
  await connectToDatabase();

  const [legacyStatusesResult, inconsistentAssignmentsResult] = await Promise.all([
    ModerationCase.updateMany(
      {
        workflowStatus: { $nin: ['open', 'assigned'] }
      },
      {
        $set: {
          workflowStatus: 'open',
          assignedTo: null,
          workflowNote: ''
        },
        $unset: {
          snoozedUntil: '',
          resolvedNote: ''
        }
      }
    ),
    ModerationCase.updateMany(
      {
        workflowStatus: 'assigned',
        assignedTo: null
      },
      {
        $set: {
          workflowStatus: 'open',
          workflowNote: ''
        },
        $unset: {
          snoozedUntil: '',
          resolvedNote: ''
        }
      }
    )
  ]);

  console.log('[database] Moderation workflow normalization complete.');
  console.log(`[database] Legacy statuses reset: ${legacyStatusesResult.modifiedCount || 0}`);
  console.log(`[database] Inconsistent assigned incidents fixed: ${inconsistentAssignmentsResult.modifiedCount || 0}`);
}

run()
  .catch((error) => {
    console.error('[database] Moderation workflow normalization failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await disconnectFromDatabase();
    } catch {
      // Ignore disconnect errors during shutdown.
    }
  });