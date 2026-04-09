import { parseTagsInput } from '../utils/hashtags.js';

// Simple HTML/JS sanitization function
function sanitizeText(text) {
  if (!text) return text;
  // Remove script tags and event handlers
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '');
}

// Validate email format
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validateRequiredHashtags(tagsInput) {
  const parsedTags = parseTagsInput(tagsInput, {
    strictHashtagFormat: typeof tagsInput === 'string'
  });

  if (parsedTags.error) {
    return {
      error: parsedTags.error,
      field: 'tags'
    };
  }

  if (!parsedTags.tags.length) {
    return {
      error: 'At least one hashtag is required',
      field: 'tags'
    };
  }

  return {
    tags: parsedTags.tags,
    field: 'tags'
  };
}

// Validate registration input
export function validateRegistration(req, res, next) {
  const { username, email, password } = req.body;

  // Check required fields
  if (!username || !email || !password) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Username, email, and password are required'
      }
    });
  }

  // Validate email format
  if (!isValidEmail(email)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid email format',
        field: 'email'
      }
    });
  }

  // Validate password length
  if (password.length < 8) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Password must be at least 8 characters long',
        field: 'password'
      }
    });
  }

  // Validate username length
  if (username.length > 50) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Username must not exceed 50 characters',
        field: 'username'
      }
    });
  }

  next();
}

// Validate profile update input
export function validateProfileUpdate(req, res, next) {
  const { username, email, bio } = req.body;

  if (username !== undefined) {
    if (!username.trim()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Username cannot be empty',
          field: 'username'
        }
      });
    }

    if (username.length > 50) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Username must not exceed 50 characters',
          field: 'username'
        }
      });
    }

    req.body.username = sanitizeText(username);
  }

  if (email !== undefined) {
    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid email format',
          field: 'email'
        }
      });
    }

    req.body.email = sanitizeText(email).toLowerCase();
  }

  if (bio !== undefined) {
    if (bio.length > 300) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Bio must not exceed 300 characters',
          field: 'bio'
        }
      });
    }

    req.body.bio = sanitizeText(bio);
  }

  next();
}

// Validate story input
export function validateStory(req, res, next) {
  const { title, content } = req.body;
  const tagValidation = validateRequiredHashtags(req.body.tags);

  // Check required fields
  if (!title || !content) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Title and content are required'
      }
    });
  }

  if (tagValidation.error) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: tagValidation.error,
        field: tagValidation.field
      }
    });
  }

  // Validate title length
  if (title.length > 200) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Title must not exceed 200 characters',
        field: 'title'
      }
    });
  }

  // Sanitize text inputs
  req.body.title = sanitizeText(title);
  req.body.content = sanitizeText(content);
  if (req.body.description) {
    req.body.description = sanitizeText(req.body.description);
  }
  req.body.tags = tagValidation.tags;

  next();
}

// Validate artwork input
export function validateArtwork(req, res, next) {
  const { title } = req.body;
  let { images } = req.body;
  const tagValidation = validateRequiredHashtags(req.body.tags);

  // Check required fields
  if (!title) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Title is required',
        field: 'title'
      }
    });
  }

  // Validate title length
  if (title.length > 200) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Title must not exceed 200 characters',
        field: 'title'
      }
    });
  }

  if (tagValidation.error) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: tagValidation.error,
        field: tagValidation.field
      }
    });
  }

  // Parse images if it's a JSON string
  if (images && typeof images === 'string') {
    try {
      images = JSON.parse(images);
      req.body.images = images;
    } catch (e) {
      // If parsing fails, treat as single URL
      req.body.images = [images];
    }
  }

  // Check if we have either uploaded files or image URLs
  const hasFiles = req.files && req.files.length > 0;
  const hasUrls = images && Array.isArray(images) && images.length > 0;

  if (!hasFiles && !hasUrls) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'At least one image is required',
        field: 'images'
      }
    });
  }

  // Sanitize text inputs
  req.body.title = sanitizeText(title);
  if (req.body.description) {
    req.body.description = sanitizeText(req.body.description);
  }
  req.body.tags = tagValidation.tags;

  next();

  next();
}

// Validate comment input
export function validateComment(req, res, next) {
  const { text } = req.body;

  // Check required field
  if (!text || text.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Comment text is required',
        field: 'text'
      }
    });
  }

  // Validate text length
  if (text.length > 1000) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Comment must not exceed 1000 characters',
        field: 'text'
      }
    });
  }

  // Sanitize text
  req.body.text = sanitizeText(text);

  next();
}

// Validate report input
export function validateReport(req, res, next) {
  const { reason } = req.body;

  // Check required field
  if (!reason || reason.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Report reason is required',
        field: 'reason'
      }
    });
  }

  // Validate reason length
  if (reason.length > 500) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Report reason must not exceed 500 characters',
        field: 'reason'
      }
    });
  }

  next();
}
