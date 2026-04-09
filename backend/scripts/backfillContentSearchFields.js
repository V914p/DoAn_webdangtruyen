import Story from '../models/Story.js';
import Artwork from '../models/Artwork.js';
import { connectToDatabase, disconnectFromDatabase } from '../config/database.js';
import { validateEnvironment } from '../config/env.js';
import { buildContentSearchFields } from '../utils/search.js';

const BATCH_SIZE = 200;
const isDryRun = process.argv.includes('--dry-run');

function hasFieldDifferences(item, nextFields) {
  const currentTitle = item.searchTitle || '';
  const currentDescription = item.searchDescription || '';
  const currentTokens = Array.isArray(item.searchTokens) ? item.searchTokens : [];

  if (currentTitle !== nextFields.searchTitle || currentDescription !== nextFields.searchDescription) {
    return true;
  }

  if (currentTokens.length !== nextFields.searchTokens.length) {
    return true;
  }

  return currentTokens.some((token, index) => token !== nextFields.searchTokens[index]);
}

async function backfillModel(Model, label) {
  let scannedItems = 0;
  let changedItems = 0;
  let updatedItems = 0;
  let lastId = null;

  while (true) {
    const query = lastId ? { _id: { $gt: lastId } } : {};
    const items = await Model.find(query)
      .select('_id title description searchTitle searchDescription searchTokens')
      .sort({ _id: 1 })
      .limit(BATCH_SIZE)
      .lean();

    if (!items.length) {
      break;
    }

    scannedItems += items.length;
    lastId = items[items.length - 1]._id;

    const operations = [];

    for (const item of items) {
      const nextFields = buildContentSearchFields(item.title, item.description);

      if (!hasFieldDifferences(item, nextFields)) {
        continue;
      }

      changedItems += 1;
      operations.push({
        updateOne: {
          filter: { _id: item._id },
          update: {
            $set: {
              searchTitle: nextFields.searchTitle,
              searchDescription: nextFields.searchDescription,
              searchTokens: nextFields.searchTokens
            }
          }
        }
      });
    }

    if (!isDryRun && operations.length) {
      const result = await Model.bulkWrite(operations, { ordered: false });
      updatedItems += result.modifiedCount || 0;
    }

    console.log(`${label}: scanned ${scannedItems}, ${changedItems} need updates${isDryRun ? '' : `, ${updatedItems} updated`}.`);
  }

  console.log(`${label} backfill complete.`);
  return {
    scannedItems,
    changedItems,
    updatedItems
  };
}

async function run() {
  validateEnvironment({ requireDatabase: true });

  await connectToDatabase();
  console.log(`Connected to MongoDB${isDryRun ? ' (dry run)' : ''}`);

  const [storyStats, artworkStats] = await Promise.all([
    backfillModel(Story, 'Stories'),
    backfillModel(Artwork, 'Artworks')
  ]);

  console.log('Backfill content search fields complete.');
  console.log(`Stories scanned: ${storyStats.scannedItems}, updated: ${storyStats.updatedItems}`);
  console.log(`Artworks scanned: ${artworkStats.scannedItems}, updated: ${artworkStats.updatedItems}`);
}

run()
  .catch((error) => {
    console.error('Backfill content search fields failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await disconnectFromDatabase();
    } catch {
      // Ignore disconnect errors during shutdown.
    }
  });