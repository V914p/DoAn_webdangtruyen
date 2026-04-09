function normalizeTagValue(tag) {
  if (typeof tag !== 'string') return '';
  return tag.trim().replace(/^#+/, '').toLowerCase();
}

function isValidTagToken(tag) {
  return /^[\p{L}\p{N}_-]+$/u.test(tag);
}

export function normalizeTagList(tags) {
  if (!Array.isArray(tags)) return [];

  const seen = new Set();
  const result = [];

  for (const tag of tags) {
    const normalized = normalizeTagValue(tag);
    if (!normalized || seen.has(normalized)) continue;

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

export function normalizeTag(tag) {
  return normalizeTagValue(tag);
}

export function parseStrictHashtagInput(input) {
  const trimmed = (input || '').trim();
  if (!trimmed) {
    return { tags: [], error: '' };
  }

  const tokens = trimmed.split(/[\s,]+/).filter(Boolean);
  const invalidToken = tokens.find((token) => {
    const normalized = normalizeTagValue(token);
    return !normalized || !isValidTagToken(normalized);
  });

  if (invalidToken) {
    return {
      tags: [],
      error: 'Invalid hashtag format. Use letters, numbers, underscores, or hyphens only, for example: #newday #sunrise.'
    };
  }

  return {
    tags: normalizeTagList(tokens),
    error: ''
  };
}

export function formatTag(tag) {
  const normalized = normalizeTagValue(tag);
  return normalized ? `#${normalized}` : '';
}
