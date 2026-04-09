import mongoose from 'mongoose';
import Story from '../models/Story.js';
import Artwork from '../models/Artwork.js';
import Comment from '../models/Comment.js';
import Follow from '../models/Follow.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { buildTagSearchConditions, normalizeTagsForQuery, parseTagsInput } from '../utils/hashtags.js';
import { escapeRegex, normalizeSearchText, tokenizeSearchText } from '../utils/search.js';
import { CACHE_NAMESPACES, getOrSetNamespacedCache, invalidateCacheNamespaces } from '../services/cacheStore.js';
import { removeContentFromAllSavedCollections } from '../utils/savedContent.js';
import webSocketManager from '../websocket/WebSocketManager.js';

const DEFAULT_TAG_TRENDING_LIMIT = 6;
const POPULAR_CREATORS_LIMIT = 10;
const DEFAULT_TAG_DIRECTORY_LIMIT = 24;
const MAX_TAG_DIRECTORY_LIMIT = 100;
const DEFAULT_HOME_FEED_LIMIT = 10;
const MAX_HOME_FEED_LIMIT = 20;

function buildRequiredHashtagError() {
  return {
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'At least one hashtag is required',
      field: 'tags'
    }
  };
}

function hasRequiredHashtags(tags) {
  return Array.isArray(tags) && tags.length > 0;
}

async function notifyFollowersAboutNewPost({ authorId, content, contentType }) {
  const followerIds = await Follow.find({ following: authorId }).distinct('follower');

  if (!followerIds.length) {
    return;
  }

  const activeFollowerIds = (await User.find({
    _id: { $in: followerIds },
    accountStatus: 'active'
  }).select('_id').lean()).map((user) => String(user._id));

  if (!activeFollowerIds.length) {
    return;
  }

  const author = await User.findById(authorId).select('username').lean();

  if (!author?.username) {
    return;
  }

  const contentLabel = contentType === 'Story' ? 'story' : 'artwork';

  const deliveryResults = await Promise.allSettled(activeFollowerIds
    .filter((recipientId) => recipientId !== String(authorId))
    .map((recipientId) => webSocketManager.sendNotification(recipientId, {
      recipient: recipientId,
      type: 'post',
      from: authorId,
      contentId: content._id,
      contentType,
      contentTitle: content.title,
      contentDeleted: false,
      message: `${author.username} posted a new ${contentLabel}: "${content.title}"`
    })));

  deliveryResults.forEach((result) => {
    if (result.status === 'rejected') {
      console.error('Failed to deliver new-post notification:', result.reason);
    }
  });
}

async function markNotificationsAsContentDeleted({ contentId, contentType, contentTitle }) {
  const linkedNotifications = await Notification.find({
    contentId,
    contentType,
    contentDeleted: { $ne: true }
  }).populate('from', 'username avatar');

  if (!linkedNotifications.length) {
    return;
  }

  const updateResults = await Promise.allSettled(linkedNotifications.map(async (notification) => {
    notification.contentDeleted = true;

    if (!notification.contentTitle && contentTitle) {
      notification.contentTitle = contentTitle;
    }

    await notification.save();
    webSocketManager.sendNotificationUpdate(notification.recipient, notification.toObject());
  }));

  updateResults.forEach((result) => {
    if (result.status === 'rejected') {
      console.error('Failed to update deleted-content notification:', result.reason);
    }
  });
}

function normalizePublishStatus(status) {
  return status === 'draft' ? 'draft' : 'approved';
}

function encodeFeedCursor(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeFeedCursor(rawCursor) {
  if (!rawCursor) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(String(rawCursor), 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function combineMongoQuery(baseQuery, extraCondition) {
  if (!extraCondition) {
    return baseQuery;
  }

  if (!baseQuery || Object.keys(baseQuery).length === 0) {
    return extraCondition;
  }

  return {
    $and: [baseQuery, extraCondition]
  };
}

function buildFeedSearchCondition(rawQuery) {
  const trimmedQuery = String(rawQuery || '').trim();

  if (!trimmedQuery) {
    return null;
  }

  const normalizedQuery = normalizeSearchText(trimmedQuery);
  const normalizedTokens = tokenizeSearchText(trimmedQuery);
  const rawRegex = escapeRegex(trimmedQuery);
  const normalizedRegex = escapeRegex(normalizedQuery);
  const normalizedTagLikeQuery = normalizedQuery.replace(/^#+/, '');
  const clauses = [
    { title: { $regex: rawRegex, $options: 'i' } },
    { description: { $regex: rawRegex, $options: 'i' } },
    { tags: { $elemMatch: { $regex: escapeRegex(normalizedTagLikeQuery || trimmedQuery), $options: 'i' } } }
  ];

  if (normalizedQuery) {
    clauses.push(
      { searchTitle: { $regex: normalizedRegex, $options: 'i' } },
      { searchDescription: { $regex: normalizedRegex, $options: 'i' } }
    );
  }

  normalizedTokens.forEach((token) => {
    clauses.push({
      searchTokens: {
        $elemMatch: {
          $regex: `^${escapeRegex(token)}`,
          $options: 'i'
        }
      }
    });
  });

  return { $or: clauses };
}

function buildFeedBaseQuery({ rawQuery, tag }) {
  let query = { status: 'approved' };
  const searchCondition = buildFeedSearchCondition(rawQuery);
  const tagCondition = buildTagSearchConditions(tag)[0] || null;

  query = combineMongoQuery(query, searchCondition);
  query = combineMongoQuery(query, tagCondition);

  return query;
}

function buildNewestCursorCondition(cursor) {
  if (!cursor?.createdAt || !cursor?.id) {
    return null;
  }

  const createdAt = new Date(cursor.createdAt);

  if (Number.isNaN(createdAt.getTime()) || !mongoose.Types.ObjectId.isValid(cursor.id)) {
    return null;
  }

  const objectId = new mongoose.Types.ObjectId(cursor.id);

  return {
    $or: [
      { createdAt: { $lt: createdAt } },
      { createdAt, _id: { $lt: objectId } }
    ]
  };
}

function buildTrendingCursorMatchStage(cursor) {
  if (!cursor?.createdAt || !cursor?.id || typeof cursor.score !== 'number') {
    return null;
  }

  const createdAt = new Date(cursor.createdAt);

  if (Number.isNaN(createdAt.getTime()) || !mongoose.Types.ObjectId.isValid(cursor.id)) {
    return null;
  }

  const objectId = new mongoose.Types.ObjectId(cursor.id);

  return {
    $match: {
      $or: [
        { engagementScore: { $lt: cursor.score } },
        { engagementScore: cursor.score, createdAt: { $lt: createdAt } },
        { engagementScore: cursor.score, createdAt, _id: { $lt: objectId } }
      ]
    }
  };
}

function compareFeedItems(left, right, sortBy) {
  if (sortBy === 'trending') {
    const scoreDiff = Number(right.engagementScore || 0) - Number(left.engagementScore || 0);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
  }

  const createdAtDiff = new Date(right.createdAt) - new Date(left.createdAt);
  if (createdAtDiff !== 0) {
    return createdAtDiff;
  }

  return String(right._id).localeCompare(String(left._id));
}

function buildNextFeedCursor(item, sortBy) {
  if (!item?._id || !item?.createdAt) {
    return null;
  }

  if (sortBy === 'trending') {
    return encodeFeedCursor({
      score: Number(item.engagementScore || 0),
      createdAt: item.createdAt,
      id: String(item._id)
    });
  }

  return encodeFeedCursor({
    createdAt: item.createdAt,
    id: String(item._id)
  });
}

async function fetchNewestFeedItemsForModel(Model, baseQuery, cursor, limit) {
  const cursorCondition = buildNewestCursorCondition(cursor);
  const query = combineMongoQuery(baseQuery, cursorCondition);

  return Model.find(query)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .populate('author', 'username avatar')
    .lean();
}

function buildTrendingProjection() {
  return {
    title: 1,
    description: 1,
    content: 1,
    images: 1,
    tags: 1,
    likes: 1,
    bookmarks: 1,
    views: 1,
    createdAt: 1,
    engagementScore: 1,
    author: {
      _id: '$author._id',
      username: '$author.username',
      avatar: '$author.avatar'
    }
  };
}

async function fetchTrendingFeedItemsForModel(Model, baseQuery, cursor, limit) {
  const pipeline = [
    { $match: baseQuery },
    {
      $addFields: {
        engagementScore: {
          $add: [
            { $multiply: [{ $ifNull: ['$likes', 0] }, 3] },
            { $multiply: [{ $ifNull: ['$bookmarks', 0] }, 2] }
          ]
        }
      }
    }
  ];

  const cursorStage = buildTrendingCursorMatchStage(cursor);
  if (cursorStage) {
    pipeline.push(cursorStage);
  }

  pipeline.push(
    {
      $lookup: {
        from: 'users',
        localField: 'author',
        foreignField: '_id',
        as: 'author'
      }
    },
    {
      $unwind: '$author'
    },
    {
      $project: buildTrendingProjection()
    },
    {
      $sort: {
        engagementScore: -1,
        createdAt: -1,
        _id: -1
      }
    },
    {
      $limit: limit + 1
    }
  );

  return Model.aggregate(pipeline);
}

async function loadHomeFeedPage({ sortBy, type, rawQuery, tag, cursor, limit }) {
  const baseQuery = buildFeedBaseQuery({ rawQuery, tag });
  const models = type === 'story'
    ? [Story]
    : type === 'artwork'
      ? [Artwork]
      : [Story, Artwork];
  const fetcher = sortBy === 'trending' ? fetchTrendingFeedItemsForModel : fetchNewestFeedItemsForModel;

  const results = await Promise.all(models.map((Model) => fetcher(Model, baseQuery, cursor, limit)));
  const mergedItems = results.flat().sort((left, right) => compareFeedItems(left, right, sortBy));
  const pageItems = mergedItems.slice(0, limit);
  const hasMore = mergedItems.length > limit;
  const nextCursor = hasMore ? buildNextFeedCursor(pageItems[pageItems.length - 1], sortBy) : null;

  return {
    items: pageItems,
    nextCursor,
    hasMore
  };
}

function parseImageOrder(rawImageOrder) {
  const items = Array.isArray(rawImageOrder)
    ? rawImageOrder
    : rawImageOrder
      ? [rawImageOrder]
      : [];

  return items
    .map((item) => {
      if (!item) {
        return null;
      }

      if (typeof item === 'string') {
        try {
          return JSON.parse(item);
        } catch (error) {
          return null;
        }
      }

      return item;
    })
    .filter((item) => item && (item.kind === 'existing' || item.kind === 'new'));
}

function collectExistingImages(rawImages) {
  if (Array.isArray(rawImages)) {
    return rawImages.filter((url) => url && typeof url === 'string');
  }

  if (typeof rawImages === 'string' && rawImages.trim()) {
    return [rawImages];
  }

  return [];
}

function resolveImagesFromRequest(req) {
  const uploadedImages = req.files?.map((file) => `/uploads/${file.filename}`) || [];
  const existingImages = collectExistingImages(req.body.images);
  const imageOrder = parseImageOrder(req.body.imageOrder);

  if (!imageOrder.length) {
    return [...existingImages, ...uploadedImages];
  }

  const finalImages = [];
  let nextUploadIndex = 0;

  imageOrder.forEach((entry) => {
    if (entry.kind === 'existing' && typeof entry.value === 'string' && entry.value.trim()) {
      finalImages.push(entry.value);
      return;
    }

    if (entry.kind === 'new' && uploadedImages[nextUploadIndex]) {
      finalImages.push(uploadedImages[nextUploadIndex]);
      nextUploadIndex += 1;
    }
  });

  if (finalImages.length) {
    return finalImages;
  }

  return [...existingImages, ...uploadedImages];
}

async function updateReadingHistory(userId, contentId, contentType) {
  const User = (await import('../models/User.js')).default;

  await User.findByIdAndUpdate(userId, {
    $pull: {
      readingHistory: { contentId }
    }
  });

  await User.findByIdAndUpdate(userId, {
    $push: {
      readingHistory: {
        $each: [{ contentId, contentType, readAt: new Date() }],
        $position: 0,
        $slice: 100
      }
    }
  });
}

function sanitizeStatusFilter(query, reqUser, status) {
  if (status && reqUser && reqUser.role === 'admin') {
    query.status = status;
  } else {
    query.status = 'approved';
  }
}

async function loadApprovedTagSources() {
  const projection = '_id tags author createdAt likes bookmarks';

  const [stories, artworks] = await Promise.all([
    Story.find({ status: 'approved', tags: { $exists: true, $ne: [] } }).select(projection),
    Artwork.find({ status: 'approved', tags: { $exists: true, $ne: [] } }).select(projection)
  ]);

  return [...stories, ...artworks];
}

async function loadCachedRecommendedTagsForUser(userId, limit = 6) {
  const requestedLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 6, 1), 20);
  const user = await User.findById(userId).select('favoriteTags');

  if (!user) {
    return null;
  }

  const favoriteTags = normalizeTagsForQuery(user.favoriteTags || []);

  if (!favoriteTags.length) {
    return {
      favoriteTags: [],
      recommendations: []
    };
  }

  return getOrSetNamespacedCache({
    namespace: CACHE_NAMESPACES.CONTENT_DISCOVERY,
    key: `recommended-tags:${userId}:${favoriteTags.join(',')}:limit=${requestedLimit}`,
    ttlSeconds: 180,
    loader: async () => {
      const approvedSources = await loadApprovedTagSources();
      const favoriteTagSet = new Set(favoriteTags);
      const recommendationMap = new Map();

      approvedSources.forEach((item) => {
        const itemTags = normalizeTagsForQuery(item.tags || []);
        const matchingFavoriteTags = itemTags.filter((tag) => favoriteTagSet.has(tag));

        if (!matchingFavoriteTags.length) {
          return;
        }

        const weight = 2 + matchingFavoriteTags.length + Number(item.likes || 0) * 2 + Number(item.bookmarks || 0);

        itemTags.forEach((tag) => {
          if (favoriteTagSet.has(tag)) {
            return;
          }

          if (!recommendationMap.has(tag)) {
            recommendationMap.set(tag, {
              name: tag,
              score: 0,
              contentCount: 0,
              latestUsedAt: item.createdAt
            });
          }

          const entry = recommendationMap.get(tag);
          entry.score += weight;
          entry.contentCount += 1;

          if (!entry.latestUsedAt || new Date(item.createdAt) > new Date(entry.latestUsedAt)) {
            entry.latestUsedAt = item.createdAt;
          }
        });
      });

      const recommendations = Array.from(recommendationMap.values())
        .sort((left, right) => {
          if (right.score !== left.score) {
            return right.score - left.score;
          }

          if (right.contentCount !== left.contentCount) {
            return right.contentCount - left.contentCount;
          }

          return new Date(right.latestUsedAt) - new Date(left.latestUsedAt);
        })
        .slice(0, requestedLimit);

      return {
        favoriteTags,
        recommendations
      };
    }
  });
}

async function loadCachedTagDirectoryStats() {
  return getOrSetNamespacedCache({
    namespace: CACHE_NAMESPACES.CONTENT_DISCOVERY,
    key: 'tag-directory-stats',
    ttlSeconds: 180,
    loader: async () => buildTagDirectoryStats(await loadApprovedTagSources())
  });
}

async function loadCachedTrendingContent() {
  return getOrSetNamespacedCache({
    namespace: CACHE_NAMESPACES.CONTENT_DISCOVERY,
    key: 'trending:last-30-days',
    ttlSeconds: 90,
    loader: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const query = {
        status: 'approved',
        createdAt: { $gte: thirtyDaysAgo }
      };

      const [stories, artworks] = await Promise.all([
        Story.find(query).populate('author', 'username avatar'),
        Artwork.find(query).populate('author', 'username avatar')
      ]);

      const allContent = [...stories, ...artworks];

      if (!allContent.length) {
        return [];
      }

      const commentCounts = await Comment.aggregate([
        {
          $match: {
            contentId: { $in: allContent.map((item) => item._id) }
          }
        },
        {
          $group: {
            _id: '$contentId',
            count: { $sum: 1 }
          }
        }
      ]);

      const commentCountMap = new Map(commentCounts.map((item) => [String(item._id), item.count]));

      return allContent
        .map((content) => {
          const commentCount = commentCountMap.get(String(content._id)) || 0;
          const daysSinceCreation = (Date.now() - new Date(content.createdAt).getTime()) / (1000 * 60 * 60 * 24);
          const score = commentCount / (daysSinceCreation + 1);

          return {
            ...content.toObject(),
            trendingScore: score
          };
        })
        .sort((left, right) => right.trendingScore - left.trendingScore)
        .slice(0, 20);
    }
  });
}

async function loadCachedPopularCreators() {
  return getOrSetNamespacedCache({
    namespace: CACHE_NAMESPACES.CONTENT_DISCOVERY,
    key: `popular-creators:likes:limit=${POPULAR_CREATORS_LIMIT}`,
    ttlSeconds: 120,
    loader: async () => {
      const approvedMatchStage = { $match: { status: 'approved' } };
      const groupStage = {
        $group: {
          _id: '$author',
          totalLikes: { $sum: '$likes' },
          postCount: { $sum: 1 },
          latestPostAt: { $max: '$createdAt' }
        }
      };

      const [storyTotals, artworkTotals] = await Promise.all([
        Story.aggregate([approvedMatchStage, groupStage]),
        Artwork.aggregate([approvedMatchStage, groupStage])
      ]);

      const creatorTotals = new Map();

      [...storyTotals, ...artworkTotals].forEach((entry) => {
        const authorId = String(entry._id || '');

        if (!authorId) {
          return;
        }

        if (!creatorTotals.has(authorId)) {
          creatorTotals.set(authorId, {
            id: authorId,
            totalLikes: 0,
            postCount: 0,
            latestPostAt: entry.latestPostAt || null
          });
        }

        const nextEntry = creatorTotals.get(authorId);
        nextEntry.totalLikes += Number(entry.totalLikes || 0);
        nextEntry.postCount += Number(entry.postCount || 0);

        if (!nextEntry.latestPostAt || new Date(entry.latestPostAt) > new Date(nextEntry.latestPostAt)) {
          nextEntry.latestPostAt = entry.latestPostAt;
        }
      });

      const users = await User.find({
        _id: { $in: [...creatorTotals.keys()] },
        accountStatus: 'active'
      }).select('_id username avatar');

      const userMap = new Map(users.map((user) => [String(user._id), user]));

      return [...creatorTotals.values()]
        .map((entry) => {
          const user = userMap.get(entry.id);

          if (!user) {
            return null;
          }

          return {
            id: entry.id,
            username: user.username,
            avatar: user.avatar || null,
            totalLikes: entry.totalLikes,
            postCount: entry.postCount,
            latestPostAt: entry.latestPostAt
          };
        })
        .filter(Boolean)
        .sort((left, right) => {
          if (right.totalLikes !== left.totalLikes) {
            return right.totalLikes - left.totalLikes;
          }

          if (right.postCount !== left.postCount) {
            return right.postCount - left.postCount;
          }

          return new Date(right.latestPostAt || 0) - new Date(left.latestPostAt || 0);
        })
        .slice(0, POPULAR_CREATORS_LIMIT);
    }
  });
}

function buildTagDirectoryStats(items) {
  const tagMap = new Map();
  const creatorsUsingTags = new Set();
  let totalTagAssignments = 0;

  for (const item of items) {
    const normalizedTags = normalizeTagsForQuery(item.tags || []);
    const uniqueTags = [...new Set(normalizedTags)];

    if (!uniqueTags.length) {
      continue;
    }

    creatorsUsingTags.add(String(item.author));

    for (const tag of uniqueTags) {
      totalTagAssignments += 1;

      if (!tagMap.has(tag)) {
        tagMap.set(tag, {
          name: tag,
          creatorIds: new Set(),
          contentIds: new Set(),
          latestUsedAt: item.createdAt
        });
      }

      const entry = tagMap.get(tag);
      entry.creatorIds.add(String(item.author));
      entry.contentIds.add(String(item._id));

      if (!entry.latestUsedAt || new Date(item.createdAt) > new Date(entry.latestUsedAt)) {
        entry.latestUsedAt = item.createdAt;
      }
    }
  }

  const tags = Array.from(tagMap.values()).map((entry) => ({
    name: entry.name,
    contentCount: entry.contentIds.size,
    creatorCount: entry.creatorIds.size,
    latestUsedAt: entry.latestUsedAt
  }));

  tags.sort((left, right) => {
    if (right.contentCount !== left.contentCount) {
      return right.contentCount - left.contentCount;
    }

    if (right.creatorCount !== left.creatorCount) {
      return right.creatorCount - left.creatorCount;
    }

    return new Date(right.latestUsedAt) - new Date(left.latestUsedAt);
  });

  return {
    tags,
    summary: {
      totalTags: tags.length,
      totalTagAssignments,
      totalCreatorsUsingTags: creatorsUsingTags.size
    }
  };
}

async function invalidateContentDiscoveryCache() {
  await invalidateCacheNamespaces([
    CACHE_NAMESPACES.CONTENT_DISCOVERY,
    CACHE_NAMESPACES.CREATOR_SEARCH,
    CACHE_NAMESPACES.PUBLIC_PROFILE
  ]);
}

async function invalidateContentInteractionCache() {
  await invalidateCacheNamespaces([
    CACHE_NAMESPACES.CONTENT_DISCOVERY,
    CACHE_NAMESPACES.PUBLIC_PROFILE
  ]);
}

// Create a new story
export async function createStory(req, res) {
  try {
    const { title, description, content, tags, status } = req.body;

    const parsedTags = parseTagsInput(tags, {
      strictHashtagFormat: typeof tags === 'string'
    });

    if (parsedTags.error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsedTags.error,
          field: 'tags'
        }
      });
    }

    if (!hasRequiredHashtags(parsedTags.tags)) {
      return res.status(400).json(buildRequiredHashtagError());
    }

    const images = resolveImagesFromRequest(req);

    const story = new Story({
      title,
      description,
      content,
      tags: parsedTags.tags,
      images,
      author: req.user.userId,
      status: normalizePublishStatus(status)
    });

    await story.save();
    await invalidateContentDiscoveryCache();

    if (story.status === 'approved') {
      await notifyFollowersAboutNewPost({
        authorId: req.user.userId,
        content: story,
        contentType: 'Story'
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Story created successfully',
      data: story
    });
  } catch (error) {
    console.error('Create story error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

// Create a new artwork
export async function createArtwork(req, res) {
  try {
    console.log('=== CREATE ARTWORK ===');
    console.log('Body:', req.body);
    console.log('Files:', req.files);
    
    const { title, description, status } = req.body;
    let images = [];
    const parsedTags = parseTagsInput(req.body.tags, {
      strictHashtagFormat: typeof req.body.tags === 'string'
    });

    if (parsedTags.error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsedTags.error,
          field: 'tags'
        }
      });
    }

    if (!hasRequiredHashtags(parsedTags.tags)) {
      return res.status(400).json(buildRequiredHashtagError());
    }

    // Handle uploaded files
    images = resolveImagesFromRequest(req);
    console.log('Image URLs from body:', req.body.images);

    console.log('Final images array:', images);
    console.log('Final tags array:', parsedTags.tags);

    // Validate that we have at least one image
    if (!images || images.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'At least one image is required'
        }
      });
    }

    const artwork = new Artwork({
      title,
      description,
      images,
      tags: parsedTags.tags,
      author: req.user.userId,
      status: normalizePublishStatus(status)
    });

    await artwork.save();
    await invalidateContentDiscoveryCache();

    if (artwork.status === 'approved') {
      await notifyFollowersAboutNewPost({
        authorId: req.user.userId,
        content: artwork,
        contentType: 'Artwork'
      });
    }
    console.log('Artwork saved:', artwork._id);

    return res.status(201).json({
      success: true,
      message: 'Artwork created successfully',
      data: artwork
    });
  } catch (error) {
    console.error('Create artwork error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

// Get content by ID (story or artwork)
export async function getContent(req, res) {
  try {
    const { id } = req.params;
    const { type } = req.query; // 'story' or 'artwork'

    let content;
    let contentType = 'Story';
    
    if (type === 'story') {
      content = await Story.findById(id).populate('author', 'username avatar');
      contentType = 'Story';
    } else if (type === 'artwork') {
      content = await Artwork.findById(id).populate('author', 'username avatar');
      contentType = 'Artwork';
    } else {
      // Try to find in both collections
      content = await Story.findById(id).populate('author', 'username avatar');
      if (!content) {
        content = await Artwork.findById(id).populate('author', 'username avatar');
        contentType = 'Artwork';
      }
    }

    if (!content) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Content not found'
        }
      });
    }

    // Allow admins to inspect removed posts while keeping them hidden from regular users.
    if (content.status === 'deleted' && req.user?.role !== 'admin') {
      return res.status(410).json({
        success: false,
        error: {
          code: 'CONTENT_DELETED',
          message: 'This post has been removed'
        }
      });
    }

    // Filter by status based on user role
    if (content.status !== 'approved' && (!req.user || req.user.role !== 'admin')) {
      // Non-admin users can only see approved content
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Content not found'
        }
      });
    }

    // Increment view counter
    content.views += 1;
    await content.save();

    if (req.user?.userId) {
      await updateReadingHistory(req.user.userId, content._id, contentType);
    }

    return res.status(200).json({
      success: true,
      data: content
    });
  } catch (error) {
    console.error('Get content error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

export async function getHomeFeed(req, res) {
  try {
    const sortBy = req.query.sort === 'trending' ? 'trending' : 'newest';
    const requestedType = req.query.type;
    const type = ['story', 'artwork'].includes(requestedType) ? requestedType : 'all';
    const rawQuery = String(req.query.q || '').trim();
    const tag = normalizeTagsForQuery(req.query.tag || '')[0] || '';
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || DEFAULT_HOME_FEED_LIMIT, 1), MAX_HOME_FEED_LIMIT);
    const rawCursor = req.query.cursor;
    const cursor = rawCursor ? decodeFeedCursor(rawCursor) : null;

    if (rawCursor && !cursor) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid feed cursor'
        }
      });
    }

    const feedPage = await loadHomeFeedPage({
      sortBy,
      type,
      rawQuery,
      tag,
      cursor,
      limit
    });

    return res.status(200).json({
      success: true,
      data: feedPage.items,
      pageInfo: {
        limit,
        hasMore: feedPage.hasMore,
        nextCursor: feedPage.nextCursor
      }
    });
  } catch (error) {
    console.error('Get home feed error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

// Search content
export async function searchContent(req, res) {
  try {
    const { q, tags, page = 1, status, type } = req.query;
    const limit = 50;
    const skip = (page - 1) * limit;
    const rawQuery = String(q || '').trim();
    const normalizedQuery = normalizeSearchText(rawQuery);
    const normalizedTokens = tokenizeSearchText(rawQuery);

    // Build query
    const query = {};

    sanitizeStatusFilter(query, req.user, status);

    // Search by text in title or description
    if (rawQuery) {
      const rawRegex = escapeRegex(rawQuery);
      const normalizedRegex = escapeRegex(normalizedQuery);
      const tokenClauses = normalizedTokens.map((token) => ({
        searchTokens: {
          $elemMatch: {
            $regex: `^${escapeRegex(token)}`,
            $options: 'i'
          }
        }
      }));

      const textQueryClauses = [
        { title: { $regex: rawRegex, $options: 'i' } },
        { description: { $regex: rawRegex, $options: 'i' } }
      ];

      if (normalizedQuery) {
        textQueryClauses.push(
          { searchTitle: { $regex: normalizedRegex, $options: 'i' } },
          { searchDescription: { $regex: normalizedRegex, $options: 'i' } }
        );
      }

      if (tokenClauses.length > 0) {
        textQueryClauses.push({ $and: tokenClauses });
      }

      query.$and = [
        ...(query.$and || []),
        { $or: textQueryClauses }
      ];
    }

    // Filter by tags
    if (tags) {
      const tagConditions = buildTagSearchConditions(tags);
      if (tagConditions.length > 0) {
        query.$and = [...(query.$and || []), ...tagConditions];
      }
    }

    let results = [];

    // Filter by type if specified
    if (type === 'story') {
      const stories = await Story.find(query)
        .populate('author', 'username avatar')
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip);
      results = stories;
    } else if (type === 'artwork') {
      const artworks = await Artwork.find(query)
        .populate('author', 'username avatar')
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip);
      results = artworks;
    } else {
      // Search in both stories and artworks
      const [stories, artworks] = await Promise.all([
        Story.find(query)
          .populate('author', 'username avatar')
          .sort({ createdAt: -1 })
          .limit(limit)
          .skip(skip),
        Artwork.find(query)
          .populate('author', 'username avatar')
          .sort({ createdAt: -1 })
          .limit(limit)
          .skip(skip)
      ]);

      // Combine and sort results
      results = [...stories, ...artworks]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit);
    }

    return res.status(200).json({
      success: true,
      data: results,
      pagination: {
        page: parseInt(page),
        limit,
        total: results.length
      }
    });
  } catch (error) {
    console.error('Search content error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

// Update content (story or artwork)
export async function updateContent(req, res) {
  try {
    const { id } = req.params;

    let content = await Story.findById(id);
    let isStory = true;

    if (!content) {
      content = await Artwork.findById(id);
      isStory = false;
    }

    if (!content) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Content not found'
        }
      });
    }

    if (content.author.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You can only edit your own content'
        }
      });
    }

    const previousStatus = content.status;

    const parsedTags = parseTagsInput(req.body.tags, {
      strictHashtagFormat: typeof req.body.tags === 'string'
    });

    if (parsedTags.error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsedTags.error,
          field: 'tags'
        }
      });
    }

    if (!hasRequiredHashtags(parsedTags.tags)) {
      return res.status(400).json(buildRequiredHashtagError());
    }

    const nextStatus = normalizePublishStatus(req.body.status ?? content.status);
    content.title = req.body.title ?? content.title;
    content.description = req.body.description ?? content.description;
    content.tags = parsedTags.tags;
    content.status = nextStatus;

    if (isStory) {
      if (!req.body.content || !req.body.content.trim()) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Title and content are required'
          }
        });
      }

      const images = resolveImagesFromRequest(req);

      content.content = req.body.content;
      content.images = images;
    } else {
      const images = resolveImagesFromRequest(req);

      if (images.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'At least one image is required'
          }
        });
      }

      content.images = images;
    }

    await content.save();
    await content.populate('author', 'username avatar');
    await invalidateContentDiscoveryCache();

    if (previousStatus !== 'approved' && content.status === 'approved') {
      await notifyFollowersAboutNewPost({
        authorId: req.user.userId,
        content,
        contentType: isStory ? 'Story' : 'Artwork'
      });
    }

    return res.status(200).json({
      success: true,
      message: `${isStory ? 'Story' : 'Artwork'} updated successfully`,
      data: content
    });
  } catch (error) {
    console.error('Update content error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

// Get trending content
export async function getTrending(req, res) {
  try {
    const trending = await loadCachedTrendingContent();

    return res.status(200).json({
      success: true,
      data: trending
    });
  } catch (error) {
    console.error('Get trending error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

export async function getPopularCreators(req, res) {
  try {
    const creators = await loadCachedPopularCreators();

    return res.status(200).json({
      success: true,
      data: creators
    });
  } catch (error) {
    console.error('Get popular creators error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

export async function getRecommendedTags(req, res) {
  try {
    const requestedLimit = Number.parseInt(req.query.limit, 10) || DEFAULT_TAG_TRENDING_LIMIT;
    const result = await loadCachedRecommendedTagsForUser(req.user.userId, requestedLimit);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'User not found'
        }
      });
    }

    return res.status(200).json({
      success: true,
      data: result.recommendations,
      favoriteTags: result.favoriteTags
    });
  } catch (error) {
    console.error('Get recommended tags error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

export async function getTrendingTags(req, res) {
  try {
    const tagStats = await loadCachedTagDirectoryStats();

    return res.status(200).json({
      success: true,
      data: tagStats.tags.slice(0, DEFAULT_TAG_TRENDING_LIMIT),
      summary: tagStats.summary,
      message: 'Trending tags loaded successfully'
    });
  } catch (error) {
    console.error('Get trending tags error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

export async function getTagDirectory(req, res) {
  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const requestedLimit = Number.parseInt(req.query.limit, 10) || DEFAULT_TAG_DIRECTORY_LIMIT;
    const limit = Math.min(Math.max(requestedLimit, 1), MAX_TAG_DIRECTORY_LIMIT);
    const query = normalizeTagsForQuery(req.query.q || req.query.tag || '').join('');
    const tagStats = await loadCachedTagDirectoryStats();

    const filteredTags = query
      ? tagStats.tags.filter((item) => item.name.includes(query))
      : tagStats.tags;

    const totalItems = filteredTags.length;
    const totalPages = totalItems ? Math.ceil(totalItems / limit) : 1;
    const items = filteredTags.slice((page - 1) * limit, page * limit);

    return res.status(200).json({
      success: true,
      data: items,
      summary: tagStats.summary,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasPreviousPage: page > 1,
        hasNextPage: page < totalPages
      },
      message: 'Tag directory loaded successfully'
    });
  } catch (error) {
    console.error('Get tag directory error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

// Toggle like on content
export async function toggleLike(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Find content in both collections
    let content = await Story.findById(id);
    if (!content) {
      content = await Artwork.findById(id);
    }

    if (!content) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Content not found'
        }
      });
    }

    // Import User model
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'User not found'
        }
      });
    }

    // Check if already liked
    const normalizedId = String(id);
    const existingLikes = (user.likes || []).map((item) => String(item));
    const hasLiked = existingLikes.includes(normalizedId);

    if (hasLiked) {
      // Unlike
      user.likes = user.likes.filter((item) => String(item) !== normalizedId);
      content.likes = Math.max(0, content.likes - 1);
    } else {
      // Like
      user.likes.push(content._id);
      content.likes += 1;
    }

    await Promise.all([user.save(), content.save()]);

    // Populate author for response
    await content.populate('author', 'username avatar');
    await invalidateContentInteractionCache();

    return res.status(200).json({
      success: true,
      data: content
    });
  } catch (error) {
    console.error('Toggle like error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

// Toggle bookmark on content
export async function toggleBookmark(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Find content in both collections
    let content = await Story.findById(id);
    if (!content) {
      content = await Artwork.findById(id);
    }

    if (!content) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Content not found'
        }
      });
    }

    // Import User model
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'User not found'
        }
      });
    }

    // Check if already bookmarked
    const normalizedId = String(id);
    const existingBookmarks = (user.bookmarks || []).map((item) => String(item));
    const hasBookmarked = existingBookmarks.includes(normalizedId);

    if (hasBookmarked) {
      // Remove bookmark
      user.bookmarks = user.bookmarks.filter((item) => String(item) !== normalizedId);
      content.bookmarks = Math.max(0, content.bookmarks - 1);
    } else {
      // Add bookmark
      user.bookmarks.push(content._id);
      content.bookmarks += 1;
    }

    await Promise.all([user.save(), content.save()]);

    // Populate author for response
    await content.populate('author', 'username avatar');
    await invalidateContentInteractionCache();

    return res.status(200).json({
      success: true,
      data: content
    });
  } catch (error) {
    console.error('Toggle bookmark error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

// Delete content (soft delete by changing status to 'deleted')
export async function deleteContent(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    console.log('=== DELETE CONTENT ===');
    console.log('Content ID:', id);
    console.log('User ID:', userId);

    // Find content in both collections
    let content = await Story.findById(id);
    let isStory = true;
    
    if (!content) {
      content = await Artwork.findById(id);
      isStory = false;
    }

    if (!content) {
      console.log('Content not found');
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Content not found'
        }
      });
    }

    console.log('Content found:', isStory ? 'Story' : 'Artwork');
    console.log('Content author:', content.author);
    console.log('Content author type:', typeof content.author);
    console.log('User ID type:', typeof userId);
    console.log('Author toString:', content.author.toString());
    console.log('Match:', content.author.toString() === userId);

    // Check if user is the author
    if (content.author.toString() !== userId) {
      console.log('User is not the author - FORBIDDEN');
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You can only delete your own content'
        }
      });
    }

    console.log('User is the author - proceeding with delete');

    // Soft delete by changing status to 'deleted'
    content.status = 'deleted';
    await content.save();
    await markNotificationsAsContentDeleted({
      contentId: content._id,
      contentType: isStory ? 'Story' : 'Artwork',
      contentTitle: content.title
    });

    console.log('Content status updated to deleted');

    const updateResult = await removeContentFromAllSavedCollections(id);
    await invalidateContentDiscoveryCache();

    console.log('Removed from bookmarks/likes:', updateResult);

    return res.status(200).json({
      success: true,
      message: 'Content deleted successfully'
    });
  } catch (error) {
    console.error('Delete content error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}
