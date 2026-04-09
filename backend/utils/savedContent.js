import User from '../models/User.js';
import Story from '../models/Story.js';
import Artwork from '../models/Artwork.js';

async function getApprovedContentIdSet(contentIds) {
  const orderedIds = (contentIds || []).map((item) => String(item));

  if (!orderedIds.length) {
    return new Set();
  }

  const uniqueIds = [...new Set(orderedIds)];
  const query = {
    _id: { $in: uniqueIds },
    status: 'approved'
  };

  const [stories, artworks] = await Promise.all([
    Story.find(query).select('_id'),
    Artwork.find(query).select('_id')
  ]);

  return new Set([...stories, ...artworks].map((item) => String(item._id)));
}

function hasDifferentIds(left, right) {
  if (left.length !== right.length) {
    return true;
  }

  return left.some((value, index) => value !== right[index]);
}

export async function pruneUserSavedContentReferences(user) {
  if (!user) {
    return {
      likes: [],
      bookmarks: [],
      changed: false
    };
  }

  const currentLikes = Array.isArray(user.likes) ? user.likes.map((item) => String(item)) : [];
  const currentBookmarks = Array.isArray(user.bookmarks) ? user.bookmarks.map((item) => String(item)) : [];
  const validIdSet = await getApprovedContentIdSet([...currentLikes, ...currentBookmarks]);

  const nextLikes = currentLikes.filter((item) => validIdSet.has(item));
  const nextBookmarks = currentBookmarks.filter((item) => validIdSet.has(item));
  const changed = hasDifferentIds(currentLikes, nextLikes) || hasDifferentIds(currentBookmarks, nextBookmarks);

  if (changed) {
    user.likes = nextLikes;
    user.bookmarks = nextBookmarks;
    await user.save();
  }

  return {
    likes: nextLikes,
    bookmarks: nextBookmarks,
    changed
  };
}

export async function removeContentFromAllSavedCollections(contentId) {
  return User.updateMany(
    { $or: [{ bookmarks: contentId }, { likes: contentId }] },
    { $pull: { bookmarks: contentId, likes: contentId } }
  );
}