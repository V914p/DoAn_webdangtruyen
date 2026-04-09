import { connectToDatabase, disconnectFromDatabase } from '../config/database.js';
import { validateEnvironment } from '../config/env.js';
import { registeredModels } from '../models/index.js';

const isDryRun = process.argv.includes('--dry-run');
const shouldSyncIndexes = process.argv.includes('--sync');

function formatIndexDefinition(fields, options = {}) {
  const fieldDefinition = Object.entries(fields)
    .map(([field, direction]) => `${field}:${direction}`)
    .join(', ');

  const flags = [];

  if (options.unique) {
    flags.push('unique');
  }

  if (options.sparse) {
    flags.push('sparse');
  }

  return flags.length ? `${fieldDefinition} (${flags.join(', ')})` : fieldDefinition;
}

async function updateModelIndexes(Model) {
  const declaredIndexes = Model.schema.indexes();

  console.log(`\n[database] ${Model.modelName}`);

  if (!declaredIndexes.length) {
    console.log('[database]   No custom indexes declared in schema.');
  } else {
    declaredIndexes.forEach(([fields, options]) => {
      console.log(`[database]   ${formatIndexDefinition(fields, options)}`);
    });
  }

  if (isDryRun) {
    return;
  }

  if (shouldSyncIndexes) {
    const droppedIndexes = await Model.syncIndexes();
    const droppedSummary = Array.isArray(droppedIndexes) && droppedIndexes.length
      ? ` Dropped stale indexes: ${droppedIndexes.join(', ')}`
      : '';

    console.log(`[database]   Synced indexes.${droppedSummary}`);
    return;
  }

  await Model.createIndexes();
  console.log('[database]   Ensured declared indexes exist.');
}

async function run() {
  validateEnvironment({ requireDatabase: true });

  if (isDryRun) {
    console.log(`[database] Dry run mode. Planned action: ${shouldSyncIndexes ? 'sync indexes' : 'create missing indexes'}.`);
  }

  await connectToDatabase();

  for (const Model of registeredModels) {
    await updateModelIndexes(Model);
  }

  console.log('\n[database] Database index update complete.');
}

run()
  .catch((error) => {
    console.error('[database] Database index update failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await disconnectFromDatabase();
    } catch {
      // Ignore disconnect errors during shutdown.
    }
  });