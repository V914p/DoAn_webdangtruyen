const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const GIF87A_SIGNATURE = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61];
const GIF89A_SIGNATURE = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46];
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50];

function startsWithSignature(bytes, signature) {
  if (bytes.length < signature.length) {
    return false;
  }

  return signature.every((value, index) => bytes[index] === value);
}

export async function detectImageMimeFromFile(file) {
  if (!file) {
    return null;
  }

  const headerBuffer = await file.slice(0, 12).arrayBuffer();
  const bytes = new Uint8Array(headerBuffer);

  if (startsWithSignature(bytes, PNG_SIGNATURE)) {
    return 'image/png';
  }

  if (startsWithSignature(bytes, JPEG_SIGNATURE)) {
    return 'image/jpeg';
  }

  if (startsWithSignature(bytes, GIF87A_SIGNATURE) || startsWithSignature(bytes, GIF89A_SIGNATURE)) {
    return 'image/gif';
  }

  if (startsWithSignature(bytes, RIFF_SIGNATURE) && startsWithSignature(bytes.slice(8, 12), WEBP_SIGNATURE)) {
    return 'image/webp';
  }

  return null;
}

export async function validateImageFilesBeforeUpload(files, options = {}) {
  const {
    maxFiles = 10,
    maxSizeBytes = 10 * 1024 * 1024,
    fieldLabel = 'image'
  } = options;

  if (!Array.isArray(files) || files.length === 0) {
    return { valid: true, files: [] };
  }

  if (files.length > maxFiles) {
    return {
      valid: false,
      error: `You can upload up to ${maxFiles} ${fieldLabel} files at once.`
    };
  }

  for (const file of files) {
    if (file.size > maxSizeBytes) {
      return {
        valid: false,
        error: `${file.name} exceeds the size limit of ${Math.round(maxSizeBytes / (1024 * 1024))}MB.`
      };
    }

    const detectedMime = await detectImageMimeFromFile(file);

    if (!detectedMime) {
      return {
        valid: false,
        error: `${file.name} is not a valid JPEG, PNG, GIF, or WebP image when checked by byte header.`
      };
    }
  }

  return {
    valid: true,
    files
  };
}

export async function validateSingleImageBeforeUpload(file, options = {}) {
  const result = await validateImageFilesBeforeUpload(file ? [file] : [], {
    maxFiles: 1,
    ...options
  });

  return {
    ...result,
    file: result.files?.[0] || null
  };
}