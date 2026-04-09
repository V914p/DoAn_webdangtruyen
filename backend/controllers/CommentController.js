import Comment from '../models/Comment.js';
import Notification from '../models/Notification.js';
import Story from '../models/Story.js';
import Artwork from '../models/Artwork.js';
import { CACHE_NAMESPACES, invalidateCacheNamespaces } from '../services/cacheStore.js';
import webSocketManager from '../websocket/WebSocketManager.js';

// Create a new comment
export async function createComment(req, res) {
  try {
    const { id } = req.params; // content ID
    const { text } = req.body;
    const { type } = req.query; // 'story' or 'artwork'

    // Find the content to get the author
    let content;
    let contentType;
    
    if (type === 'story') {
      content = await Story.findById(id);
      contentType = 'Story';
    } else if (type === 'artwork') {
      content = await Artwork.findById(id);
      contentType = 'Artwork';
    } else {
      content = await Story.findById(id);
      contentType = content ? 'Story' : null;

      if (!content) {
        content = await Artwork.findById(id);
        contentType = content ? 'Artwork' : null;
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

    // Only allow comments on approved content
    if (content.status !== 'approved') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Cannot comment on non-approved content'
        }
      });
    }

    // Create comment
    const comment = new Comment({
      user: req.user.userId,
      contentId: id,
      contentType,
      text
    });

    await comment.save();
    await invalidateCacheNamespaces([
      CACHE_NAMESPACES.COMMENT_THREADS,
      CACHE_NAMESPACES.CONTENT_DISCOVERY
    ]);

    // Populate user info
    await comment.populate('user', 'username avatar');

    webSocketManager.broadcastCommentCreated(content._id, comment.toObject());

    // Create notification for content author (if not commenting on own content)
    if (content.author.toString() !== req.user.userId) {
      await webSocketManager.sendNotification(content.author, {
        recipient: content.author,
        type: 'comment',
        from: req.user.userId,
        contentId: content._id,
        commentId: comment._id,
        commentPreview: text.trim().slice(0, 280),
        commentDeleted: false,
        contentType,
        message: `Someone commented on your ${contentType.toLowerCase()}: "${content.title}"`
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Comment created successfully',
      data: comment
    });
  } catch (error) {
    console.error('Create comment error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

// Delete own comment
export async function deleteComment(req, res) {
  try {
    const { id } = req.params;

    const comment = await Comment.findById(id);

    if (!comment) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Comment not found'
        }
      });
    }

    if (comment.user.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You can only delete your own comment'
        }
      });
    }

    const contentId = comment.contentId;
    const linkedNotifications = await Notification.find({ commentId: id, type: 'comment' }).populate('from', 'username avatar');

    await Promise.all(
      linkedNotifications.map(async (notification) => {
        notification.commentDeleted = true;
        await notification.save();
        webSocketManager.sendNotificationUpdate(notification.recipient, notification.toObject());
      })
    );

    await Comment.findByIdAndDelete(id);
    await invalidateCacheNamespaces([
      CACHE_NAMESPACES.COMMENT_THREADS,
      CACHE_NAMESPACES.CONTENT_DISCOVERY
    ]);
    webSocketManager.broadcastCommentDeleted(contentId, id);

    return res.status(200).json({
      success: true,
      message: 'Comment deleted successfully'
    });
  } catch (error) {
    console.error('Delete comment error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

// Get comments for content
export async function getComments(req, res) {
  try {
    const { id } = req.params; // content ID

    const comments = await Comment.find({ contentId: id })
      .populate('user', 'username avatar')
      .sort({ createdAt: 1 }); // Oldest first

    return res.status(200).json({
      success: true,
      data: comments
    });
  } catch (error) {
    console.error('Get comments error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}
