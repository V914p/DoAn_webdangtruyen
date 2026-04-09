import User from '../models/User.js';
import { connectToDatabase, disconnectFromDatabase } from '../config/database.js';
import { validateEnvironment } from '../config/env.js';
import { buildSearchNameFields } from '../utils/search.js';

const BATCH_SIZE = 200;
const isDryRun = process.argv.includes('--dry-run');

function hasSearchFieldChanges(user, nextFields) {
  const currentSearchName = user.searchName || '';
  const currentSearchTokens = Array.isArray(user.searchTokens) ? user.searchTokens : [];

  if (currentSearchName !== nextFields.searchName) {
    return true;
  }

  if (currentSearchTokens.length !== nextFields.searchTokens.length) {
    return true;
  }

  return currentSearchTokens.some((token, index) => token !== nextFields.searchTokens[index]);
}

async function run() {
  validateEnvironment({ requireDatabase: true });

  await connectToDatabase();
  console.log(`Connected to MongoDB${isDryRun ? ' (dry run)' : ''}`);

  let scannedUsers = 0;
  let changedUsers = 0;
  let updatedUsers = 0;
  let lastId = null;

  while (true) {
    const query = lastId ? { _id: { $gt: lastId } } : {};
    const users = await User.find(query)
      .select('_id username searchName searchTokens')
      .sort({ _id: 1 })
      .limit(BATCH_SIZE)
      .lean();

    if (!users.length) {
      break;
    }

    scannedUsers += users.length;
    lastId = users[users.length - 1]._id;

    const operations = [];

    for (const user of users) {
      const nextFields = buildSearchNameFields(user.username);

      if (!hasSearchFieldChanges(user, nextFields)) {
        continue;
      }

      changedUsers += 1;
      operations.push({
        updateOne: {
          filter: { _id: user._id },
          update: {
            $set: {
              searchName: nextFields.searchName,
              searchTokens: nextFields.searchTokens
            }
          }
        }
      });
    }

    if (!isDryRun && operations.length) {
      const result = await User.bulkWrite(operations, { ordered: false });
      updatedUsers += result.modifiedCount || 0;
    }

    console.log(`Scanned ${scannedUsers} users so far, ${changedUsers} need updates${isDryRun ? '' : `, ${updatedUsers} updated`}.`);
  }

  console.log('Backfill complete.');
  console.log(`Users scanned: ${scannedUsers}`);
  console.log(`Users needing updates: ${changedUsers}`);
  if (!isDryRun) {
    console.log(`Users updated: ${updatedUsers}`);
  }
}

run()
  .catch((error) => {
    console.error('Backfill user search fields failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await disconnectFromDatabase();
    } catch {
      // Ignore disconnect errors during shutdown.
    }
  });