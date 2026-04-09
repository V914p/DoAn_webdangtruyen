import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileTypeFromFile } from 'file-type';
import { env } from '../config/env.js';
import { ensureUploadsDirectory, uploadsDir } from '../config/paths.js';

ensureUploadsDirectory();

const fsPromises = fs.promises;
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Generate a temporary filename. The final extension is decided after byte-header validation.
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${uniqueSuffix}.upload`);
  }
});

async function cleanupUploadedFiles(files) {
  await Promise.all((files || []).map(async (file) => {
    if (!file?.path) {
      return;
    }

    try {
      await fsPromises.unlink(file.path);
    } catch {
      // Ignore cleanup failures so the original validation error is preserved.
    }
  }));
}

async function validateAndNormalizeFile(file) {
  const detectedFileType = await fileTypeFromFile(file.path);

  if (!detectedFileType || !allowedMimeTypes.has(detectedFileType.mime)) {
    throw new Error('Invalid image file. Only JPEG, PNG, GIF, and WebP images with valid byte headers are allowed.');
  }

  const nextFilename = `${path.parse(file.filename).name}.${detectedFileType.ext}`;
  const nextPath = path.join(uploadsDir, nextFilename);

  await fsPromises.rename(file.path, nextPath);

  return {
    ...file,
    filename: nextFilename,
    path: nextPath,
    mimetype: detectedFileType.mime
  };
}

function sendUploadError(res, error) {
  return res.status(400).json({
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: error?.message || 'Invalid upload payload'
    }
  });
}

function wrapUpload(handler) {
  return (req, res, next) => {
    handler(req, res, async (error) => {
      if (error) {
        return sendUploadError(res, error);
      }

      const uploadedFiles = req.files
        ? [...req.files]
        : req.file
          ? [req.file]
          : [];

      if (!uploadedFiles.length) {
        return next();
      }

      const normalizedFiles = [];

      try {
        for (const file of uploadedFiles) {
          normalizedFiles.push(await validateAndNormalizeFile(file));
        }

        if (req.file) {
          [req.file] = normalizedFiles;
        } else {
          req.files = normalizedFiles;
        }

        return next();
      } catch (validationError) {
        await cleanupUploadedFiles([...uploadedFiles, ...normalizedFiles]);
        return sendUploadError(res, validationError);
      }
    });
  };
}

// Configure multer
const baseUpload = multer({
  storage: storage,
  limits: {
    fileSize: env.maxFileSize
  }
});

const upload = {
  single(fieldName) {
    return wrapUpload(baseUpload.single(fieldName));
  },
  array(fieldName, maxCount) {
    return wrapUpload(baseUpload.array(fieldName, maxCount));
  }
};

export default upload;
