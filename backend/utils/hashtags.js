function normalizeTagValue(tag) {
  if (typeof tag !== 'string') return '';
  return tag.trim().replace(/^#+/, '').toLowerCase();
}

function isValidTagToken(tag) {
  return /^[\p{L}\p{N}_-]+$/u.test(tag);
}

function dedupeTags(tags) {
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseTagsInput(input, options = {}) {
  const { strictHashtagFormat = false } = options;

  if (input === undefined || input === null || input === '') {
    return { tags: [] };
  }

  let rawTags = [];

  if (Array.isArray(input)) {
    rawTags = input;
  } else if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return { tags: [] };

    const shouldParseAsHashtags = strictHashtagFormat || trimmed.includes('#') || trimmed.includes(',') || trimmed.includes(' ');

    if (shouldParseAsHashtags) {
      const tokens = trimmed.split(/[\s,]+/).filter(Boolean);
      const invalidToken = tokens.find((token) => {
        const normalized = normalizeTagValue(token);
        return !normalized || !isValidTagToken(normalized);
      });

      if (invalidToken) {
        return {
          error: 'Hashtag format is invalid. Use letters, numbers, underscores, or hyphens only (example: #ngaymoi #tuoidep).'
        };
      }

      rawTags = tokens;
    } else if (trimmed.includes(',')) {
      rawTags = trimmed.split(',').map((token) => token.trim()).filter(Boolean);
    } else {
      rawTags = [trimmed];
    }
  } else {
    return { tags: [] };
  }

  return { tags: dedupeTags(rawTags) };
}

export function normalizeTagsForQuery(tags) {
  if (!tags) return [];
  const raw = Array.isArray(tags) ? tags : [tags];
  return dedupeTags(raw);
}

export function buildTagSearchConditions(tags) {
  const normalizedTags = normalizeTagsForQuery(tags);

  return normalizedTags.map((tag) => ({
    tags: {
      $elemMatch: {
        $regex: `^#?${escapeRegExp(tag)}$`,
        $options: 'i'
      }
    }
  }));
}
