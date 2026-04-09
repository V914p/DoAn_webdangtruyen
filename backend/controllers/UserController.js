import User from '../models/User.js';
import Story from '../models/Story.js';
import Artwork from '../models/Artwork.js';
import Follow from '../models/Follow.js';
import Phone from '../models/Phone.js';
import { createOtpForUser } from '../services/otpService.js';
import { sendSms } from '../services/smsService.js';
import { CACHE_NAMESPACES, getOrSetNamespacedCache, invalidateCacheNamespaces } from '../services/cacheStore.js';
import webSocketManager from '../websocket/WebSocketManager.js';
import { buildSearchNameFields, escapeRegex, normalizeSearchText, similarityScore, tokenizeSearchText } from '../utils/search.js';
import { normalizeTagsForQuery } from '../utils/hashtags.js';
import { pruneUserSavedContentReferences } from '../utils/savedContent.js';

const MAX_FAVORITE_TAGS = 20;

async function invalidateCreatorCache() {
  await invalidateCacheNamespaces([
    CACHE_NAMESPACES.CONTENT_DISCOVERY,
    CACHE_NAMESPACES.CREATOR_SEARCH,
    CACHE_NAMESPACES.PUBLIC_PROFILE
  ]);
}

async function cleanupOrphanedFollowRelations(match, relationField) {
  const relations = await Follow.find(match)
    .select(`_id ${relationField}`)
    .populate(relationField, '_id');

  const orphanedIds = relations
    .filter((item) => !item[relationField])
    .map((item) => item._id);

  if (orphanedIds.length > 0) {
    await Follow.deleteMany({ _id: { $in: orphanedIds } });
  }

  return orphanedIds;
}

async function countValidFollowRelations(match, relationField) {
  await cleanupOrphanedFollowRelations(match, relationField);
  return Follow.countDocuments(match);
}

async function getValidFollowUsers(match, relationField) {
  await cleanupOrphanedFollowRelations(match, relationField);

  const relations = await Follow.find(match)
    .populate(relationField, 'username avatar bio')
    .sort({ createdAt: -1 });

  return relations.map((item) => item[relationField]).filter(Boolean);
}

async function getSavedContentByIds(contentIds) {
  const orderedIds = contentIds.map((item) => String(item));

  if (!orderedIds.length) {
    return [];
  }

  const uniqueIds = [...new Set(orderedIds)];
  const contentQuery = {
    _id: { $in: uniqueIds },
    status: 'approved'
  };

  const [stories, artworks] = await Promise.all([
    Story.find(contentQuery).populate('author', 'username avatar'),
    Artwork.find(contentQuery).populate('author', 'username avatar')
  ]);

  const contentMap = new Map(
    [...stories, ...artworks].map((item) => [String(item._id), item.toObject()])
  );

  return orderedIds
    .map((itemId) => contentMap.get(itemId))
    .filter(Boolean);
}

async function getUserSavedContent(req, res, fieldName) {
  const user = await User.findById(req.user.userId).select('likes bookmarks');

  if (!user) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'User not found'
      }
    });
  }

  const sanitizedCollections = await pruneUserSavedContentReferences(user);

  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 12, 1), 24);
  const items = await getSavedContentByIds(sanitizedCollections[fieldName] || []);
  const totalItems = items.length;
  const totalPages = totalItems ? Math.ceil(totalItems / limit) : 1;
  const paginatedItems = items.slice((page - 1) * limit, page * limit);

  return res.status(200).json({
    success: true,
    data: paginatedItems,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages
    }
  });
}

function normalizeSingleTagInput(rawTag) {
  const normalized = normalizeTagsForQuery(rawTag);
  return normalized[0] || '';
}

export async function getFavoriteTags(req, res) {
  try {
    const user = await User.findById(req.user.userId).select('favoriteTags');

    if (!user) {
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
      data: normalizeTagsForQuery(user.favoriteTags || [])
    });
  } catch (error) {
    console.error('Get favorite tags error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

export async function addFavoriteTag(req, res) {
  try {
    const normalizedTag = normalizeSingleTagInput(req.body.tag);

    if (!normalizedTag) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'A valid hashtag is required',
          field: 'tag'
        }
      });
    }

    const user = await User.findById(req.user.userId).select('favoriteTags');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'User not found'
        }
      });
    }

    const existingTags = normalizeTagsForQuery(user.favoriteTags || []);

    if (existingTags.includes(normalizedTag)) {
      return res.status(200).json({
        success: true,
        message: 'Tag already saved to favorites',
        data: existingTags
      });
    }

    if (existingTags.length >= MAX_FAVORITE_TAGS) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `You can save up to ${MAX_FAVORITE_TAGS} favorite hashtags only`
        }
      });
    }

    user.favoriteTags = [...existingTags, normalizedTag];
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Favorite hashtag saved successfully',
      data: user.favoriteTags
    });
  } catch (error) {
    console.error('Add favorite tag error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

export async function removeFavoriteTag(req, res) {
  try {
    const normalizedTag = normalizeSingleTagInput(req.params.tag);

    if (!normalizedTag) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'A valid hashtag is required',
          field: 'tag'
        }
      });
    }

    const user = await User.findById(req.user.userId).select('favoriteTags');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'User not found'
        }
      });
    }

    user.favoriteTags = normalizeTagsForQuery((user.favoriteTags || []).filter((tag) => tag !== normalizedTag));
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Favorite hashtag removed successfully',
      data: user.favoriteTags
    });
  } catch (error) {
    console.error('Remove favorite tag error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

// Get user profile
export async function getProfile(req, res) {
  try {
    const { id } = req.params;

    const user = await User.findById(id).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'User not found'
        }
      });
    }

    const isOwnProfile = req.user?.userId === id;
    const contentQuery = isOwnProfile
      ? { author: id, status: { $ne: 'deleted' } }
      : { author: id, status: 'approved' };
    const followerMatch = { following: id };
    const followingMatch = { follower: id };

    // Get user's content (exclude deleted content)
    const [stories, artworks, followerCount, followingCount] = await Promise.all([
      Story.find(contentQuery).populate('author', 'username avatar').sort({ createdAt: -1 }),
      Artwork.find(contentQuery).populate('author', 'username avatar').sort({ createdAt: -1 }),
      countValidFollowRelations(followerMatch, 'follower'),
      countValidFollowRelations(followingMatch, 'following')
    ]);

    // Check if current user is following this profile (if authenticated)
    let isFollowing = false;
    if (req.user && req.user.userId) {
      const followRelation = await Follow.findOne({
        follower: req.user.userId,
        following: id
      });
      isFollowing = !!followRelation;
    }

    return res.status(200).json({
      success: true,
      data: {
        user,
        content: [...stories, ...artworks],
        followerCount,
        followingCount,
        isFollowing
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

// Update user profile
export async function updateProfile(req, res) {
  try {
    const updates = {};
    const { username, email, bio } = req.body;

    if (username !== undefined) {
      updates.username = username.trim();
      Object.assign(updates, buildSearchNameFields(updates.username));
    }
    if (email !== undefined) updates.email = email.trim().toLowerCase();
    if (bio !== undefined) updates.bio = bio;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'At least one profile field is required'
        }
      });
    }

    if (updates.username || updates.email) {
      const duplicateConditions = [];
      if (updates.username) duplicateConditions.push({ username: updates.username });
      if (updates.email) duplicateConditions.push({ email: updates.email });

      const duplicateUser = await User.findOne({
        _id: { $ne: req.user.userId },
        $or: duplicateConditions
      });

      if (duplicateUser) {
        const field = duplicateUser.email === updates.email ? 'email' : 'username';
        return res.status(409).json({
          success: false,
          error: {
            code: 'DUPLICATE_ERROR',
            message: `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`,
            field
          }
        });
      }
    }

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      updates,
      { new: true }
    ).select('-password');
    await invalidateCreatorCache();

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: user
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

// Update authenticated user's phone number and send verification OTP via SMS
export async function updatePhoneNumber(req, res) {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber || !String(phoneNumber).trim()) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'phoneNumber is required', field: 'phoneNumber' } });
    }

    const normalized = String(phoneNumber).replace(/[^+\d]/g, '');

    // Check if phone is already used by another account
    const existing = await User.findOne({ phoneNumber: normalized, _id: { $ne: req.user.userId } });
    if (existing) {
      return res.status(409).json({ success: false, error: { code: 'DUPLICATE_ERROR', message: 'Phone number already in use', field: 'phoneNumber' } });
    }

    // Save phone record
    try {
      await Phone.create({ user: req.user.userId, number: phoneNumber, normalized, verified: false });
    } catch (e) {
      // ignore duplicate phone history errors
    }

    const user = await User.findByIdAndUpdate(req.user.userId, { phoneNumber: normalized, phoneVerified: false }, { new: true }).select('-password');

    // Create OTP and send via SMS
    try {
      const { code } = await createOtpForUser(req.user.userId, 'verify');
      const message = `Your verification code is: ${code}. It expires in 15 minutes.`;
      await sendSms({ to: normalized, body: message });
    } catch (smsError) {
      console.error('[user] Failed to send verification SMS:', smsError);
    }

    await invalidateCreatorCache();

    return res.status(200).json({ success: true, message: 'Phone updated. Verification code sent.' , data: user });
  } catch (error) {
    console.error('Update phone error:', error);
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
  }
}

function scoreCreatorMatch({ normalizedQuery, queryTokens, user, stats, followingIds, viewedAuthorIds }) {
  const normalizedName = user.searchName || normalizeSearchText(user.username);
  const nameTokens = user.searchTokens?.length ? user.searchTokens : tokenizeSearchText(normalizedName);
  let score = 0;
  let matchedTokens = 0;

  if (!normalizedQuery) {
    score += 10;
  } else {
    if (normalizedName === normalizedQuery) score += 140;
    else if (normalizedName.startsWith(normalizedQuery)) score += 110;
    else if (normalizedName.includes(normalizedQuery)) score += 80;

    for (const queryToken of queryTokens) {
      let tokenMatched = false;

      if (nameTokens.includes(queryToken)) {
        score += 45;
        tokenMatched = true;
      } else if (nameTokens.some((token) => token.startsWith(queryToken) || queryToken.startsWith(token))) {
        score += 30;
        tokenMatched = true;
      } else {
        const similarities = nameTokens.map((token) => similarityScore(queryToken, token));
        const bestSimilarity = similarities.length ? Math.max(...similarities) : similarityScore(queryToken, normalizedName);

        if (bestSimilarity >= 0.74) {
          score += Math.round(bestSimilarity * 32);
          tokenMatched = true;
        }
      }

      if (tokenMatched) {
        matchedTokens += 1;
      }
    }

    if (!matchedTokens && score < 60) {
      return null;
    }
  }

  score += Math.min((stats.approvedContentCount || 0) * 3, 24);
  score += Math.min((stats.followerCount || 0) * 2, 24);
  if (user.isVerified) score += 20;
  if (followingIds.has(String(user._id))) score += 10;
  if (viewedAuthorIds.has(String(user._id))) score += 8;

  return {
    score,
    matchedTokens,
    matchQuality:
      normalizedName === normalizedQuery
        ? 'exact'
        : matchedTokens >= Math.max(1, queryTokens.length)
          ? 'strong'
          : 'fuzzy'
  };
}

function buildCreatorSearchCacheKey({ rawQuery, normalizedQuery, page, limit }) {
  const normalizedRaw = rawQuery.toLowerCase() || '_';
  const normalizedSearch = normalizedQuery || '_';
  return [normalizedRaw, normalizedSearch, page, limit].map((item) => encodeURIComponent(String(item))).join(':');
}

async function buildCreatorSearchResponse({ rawQuery, normalizedQuery, queryTokens, page, limit, viewerUserId = null }) {
  const regexClauses = [];
  if (normalizedQuery) {
    regexClauses.push({ searchName: { $regex: escapeRegex(normalizedQuery), $options: 'i' } });
    regexClauses.push({ username: { $regex: escapeRegex(rawQuery), $options: 'i' } });
  }

  for (const token of queryTokens) {
    regexClauses.push({ searchName: { $regex: escapeRegex(token), $options: 'i' } });
    if (token.length >= 3) {
      regexClauses.push({ searchTokens: { $elemMatch: { $regex: `^${escapeRegex(token.slice(0, 3))}`, $options: 'i' } } });
    }
  }

  const baseQuery = {
    accountStatus: 'active'
  };

  const candidateQuery = regexClauses.length
    ? { ...baseQuery, $or: regexClauses }
    : baseQuery;

  const initialCandidates = await User.find(candidateQuery)
    .select('username avatar bio isVerified searchName searchTokens createdAt')
    .limit(120)
    .sort({ isVerified: -1, createdAt: -1 });

  let candidates = initialCandidates;

  if (normalizedQuery && initialCandidates.length < 40) {
    const fallbackCandidates = await User.find(baseQuery)
      .select('username avatar bio isVerified searchName searchTokens createdAt')
      .limit(160)
      .sort({ isVerified: -1, createdAt: -1 });

    const candidateMap = new Map();
    for (const user of [...initialCandidates, ...fallbackCandidates]) {
      candidateMap.set(String(user._id), user);
    }
    candidates = Array.from(candidateMap.values());
  }

  const candidateIds = candidates.map((item) => item._id);

  const [storyCounts, artworkCounts, followerCounts, followingRelations, viewedAuthors] = await Promise.all([
    Story.aggregate([
      { $match: { author: { $in: candidateIds }, status: 'approved' } },
      { $group: { _id: '$author', count: { $sum: 1 } } }
    ]),
    Artwork.aggregate([
      { $match: { author: { $in: candidateIds }, status: 'approved' } },
      { $group: { _id: '$author', count: { $sum: 1 } } }
    ]),
    (async () => {
      const match = { following: { $in: candidateIds } };
      await cleanupOrphanedFollowRelations(match, 'follower');
      return Follow.aggregate([
        { $match: match },
        { $group: { _id: '$following', count: { $sum: 1 } } }
      ]);
    })(),
    viewerUserId
      ? Follow.find({ follower: viewerUserId, following: { $in: candidateIds } }).select('following')
      : Promise.resolve([]),
    viewerUserId
      ? (async () => {
          const currentUser = await User.findById(viewerUserId).select('readingHistory');
          const storyIds = (currentUser?.readingHistory || []).filter((item) => item.contentType === 'Story').map((item) => item.contentId);
          const artworkIds = (currentUser?.readingHistory || []).filter((item) => item.contentType === 'Artwork').map((item) => item.contentId);
          const [readStories, readArtworks] = await Promise.all([
            storyIds.length ? Story.find({ _id: { $in: storyIds } }).select('author') : Promise.resolve([]),
            artworkIds.length ? Artwork.find({ _id: { $in: artworkIds } }).select('author') : Promise.resolve([])
          ]);
          return new Set([...readStories, ...readArtworks].map((item) => String(item.author)));
        })()
      : Promise.resolve(new Set())
  ]);

  const storyCountMap = new Map(storyCounts.map((item) => [String(item._id), item.count]));
  const artworkCountMap = new Map(artworkCounts.map((item) => [String(item._id), item.count]));
  const followerCountMap = new Map(followerCounts.map((item) => [String(item._id), item.count]));
  const followingIds = new Set(followingRelations.map((item) => String(item.following)));

  const rankedCreators = candidates
    .map((user) => {
      const stats = {
        approvedContentCount: (storyCountMap.get(String(user._id)) || 0) + (artworkCountMap.get(String(user._id)) || 0),
        followerCount: followerCountMap.get(String(user._id)) || 0
      };
      const match = scoreCreatorMatch({
        normalizedQuery,
        queryTokens,
        user,
        stats,
        followingIds,
        viewedAuthorIds: viewedAuthors
      });

      if (!match) {
        return null;
      }

      return {
        _id: user._id,
        username: user.username,
        avatar: user.avatar || null,
        bio: user.bio || '',
        isVerified: Boolean(user.isVerified),
        searchName: user.searchName || normalizeSearchText(user.username),
        approvedContentCount: stats.approvedContentCount,
        followerCount: stats.followerCount,
        matchQuality: match.matchQuality,
        score: match.score,
        isFollowedByCurrentUser: followingIds.has(String(user._id)),
        hasBeenViewedByCurrentUser: viewedAuthors.has(String(user._id))
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.isVerified !== left.isVerified) return Number(right.isVerified) - Number(left.isVerified);
      if (right.followerCount !== left.followerCount) return right.followerCount - left.followerCount;
      if (right.approvedContentCount !== left.approvedContentCount) return right.approvedContentCount - left.approvedContentCount;
      return left.username.localeCompare(right.username);
    });

  const totalItems = rankedCreators.length;
  const totalPages = totalItems ? Math.ceil(totalItems / limit) : 1;
  const paginatedResults = rankedCreators.slice((page - 1) * limit, page * limit);

  return {
    success: true,
    data: paginatedResults,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages
    }
  };
}

export async function searchCreators(req, res) {
  try {
    const rawQuery = String(req.query.query || req.query.q || '').trim();
    const normalizedQuery = normalizeSearchText(rawQuery);
    const queryTokens = tokenizeSearchText(rawQuery);
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 12, 1), 30);
    const viewerUserId = req.user?.userId || null;

    const payload = viewerUserId
      ? await buildCreatorSearchResponse({ rawQuery, normalizedQuery, queryTokens, page, limit, viewerUserId })
      : await getOrSetNamespacedCache({
          namespace: CACHE_NAMESPACES.CREATOR_SEARCH,
          key: buildCreatorSearchCacheKey({ rawQuery, normalizedQuery, page, limit }),
          ttlSeconds: 60,
          loader: () => buildCreatorSearchResponse({ rawQuery, normalizedQuery, queryTokens, page, limit })
        });

    return res.status(200).json(payload);
  } catch (error) {
    console.error('Search creators error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

// Update user avatar
export async function updateAvatar(req, res) {
  try {
    let avatarUrl;

    // Check if file was uploaded
    if (req.file) {
      // File uploaded - use the file path
      avatarUrl = `/uploads/${req.file.filename}`;
    } else if (req.body.avatar) {
      // URL provided
      avatarUrl = req.body.avatar;
    } else {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Avatar file or URL is required'
        }
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { avatar: avatarUrl },
      { new: true }
    ).select('-password');
    await invalidateCreatorCache();

    return res.status(200).json({
      success: true,
      message: 'Avatar updated successfully',
      data: user
    });
  } catch (error) {
    console.error('Update avatar error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

// Follow a user
export async function followUser(req, res) {
  try {
    const { id } = req.params; // User to follow

    // Check if trying to follow self
    if (id === req.user.userId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Cannot follow yourself'
        }
      });
    }

    // Check if user exists
    const userToFollow = await User.findById(id);
    if (!userToFollow) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'User not found'
        }
      });
    }

    // Check for existing follow
    const existingFollow = await Follow.findOne({
      follower: req.user.userId,
      following: id
    });

    if (existingFollow) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_ERROR',
          message: 'Already following this user'
        }
      });
    }

    // Create follow relationship
    const follow = new Follow({
      follower: req.user.userId,
      following: id
    });

    await follow.save();
    await invalidateCreatorCache();

    await webSocketManager.sendNotification(id, {
      recipient: id,
      type: 'follow',
      from: req.user.userId,
      message: 'Someone started following you'
    });

    return res.status(201).json({
      success: true,
      message: 'Successfully followed user',
      data: follow
    });
  } catch (error) {
    console.error('Follow user error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

// Unfollow a user
export async function unfollowUser(req, res) {
  try {
    const { id } = req.params; // User to unfollow

    const result = await Follow.findOneAndDelete({
      follower: req.user.userId,
      following: id
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Follow relationship not found'
        }
      });
    }

    await invalidateCreatorCache();

    return res.status(200).json({
      success: true,
      message: 'Successfully unfollowed user'
    });
  } catch (error) {
    console.error('Unfollow user error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

// Get followers list for a user
export async function getFollowers(req, res) {
  try {
    const { id } = req.params;

    const followers = await getValidFollowUsers({ following: id }, 'follower');

    return res.status(200).json({
      success: true,
      data: followers
    });
  } catch (error) {
    console.error('Get followers error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

// Get following list for a user
export async function getFollowing(req, res) {
  try {
    const { id } = req.params;

    const following = await getValidFollowUsers({ follower: id }, 'following');

    return res.status(200).json({
      success: true,
      data: following
    });
  } catch (error) {
    console.error('Get following error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

// Get current user's reading history
export async function getReadingHistory(req, res) {
  try {
    const user = await User.findById(req.user.userId).select('readingHistory');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'User not found'
        }
      });
    }

    const storyIds = user.readingHistory
      .filter((entry) => entry.contentType === 'Story')
      .map((entry) => entry.contentId);
    const artworkIds = user.readingHistory
      .filter((entry) => entry.contentType === 'Artwork')
      .map((entry) => entry.contentId);

    const [stories, artworks] = await Promise.all([
      Story.find({ _id: { $in: storyIds }, status: { $ne: 'deleted' } }).populate('author', 'username avatar'),
      Artwork.find({ _id: { $in: artworkIds }, status: { $ne: 'deleted' } }).populate('author', 'username avatar')
    ]);

    const storyMap = new Map(stories.map((story) => [story._id.toString(), story]));
    const artworkMap = new Map(artworks.map((artwork) => [artwork._id.toString(), artwork]));

    const history = user.readingHistory
      .map((entry) => {
        const content = entry.contentType === 'Story'
          ? storyMap.get(entry.contentId.toString())
          : artworkMap.get(entry.contentId.toString());

        if (!content) return null;

        return {
          ...content.toObject(),
          contentType: entry.contentType,
          readAt: entry.readAt
        };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.readAt) - new Date(a.readAt));

    return res.status(200).json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('Get reading history error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

export async function getBookmarkedContent(req, res) {
  try {
    return await getUserSavedContent(req, res, 'bookmarks');
  } catch (error) {
    console.error('Get bookmarked content error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

export async function getLikedContent(req, res) {
  try {
    return await getUserSavedContent(req, res, 'likes');
  } catch (error) {
    console.error('Get liked content error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}
