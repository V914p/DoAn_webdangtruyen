export function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]+/gu, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeSearchText(value) {
  return normalizeSearchText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);
}

export function buildSearchNameFields(value) {
  const searchName = normalizeSearchText(value);
  return {
    searchName,
    searchTokens: tokenizeSearchText(searchName)
  };
}

export function buildContentSearchFields(title, description = '') {
  const searchTitle = normalizeSearchText(title);
  const searchDescription = normalizeSearchText(description);
  const searchTokens = [...new Set(tokenizeSearchText(`${searchTitle} ${searchDescription}`))];

  return {
    searchTitle,
    searchDescription,
    searchTokens
  };
}

export function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function levenshteinDistance(left, right) {
  const source = String(left || '');
  const target = String(right || '');

  if (!source.length) return target.length;
  if (!target.length) return source.length;

  const matrix = Array.from({ length: source.length + 1 }, () => new Array(target.length + 1).fill(0));

  for (let row = 0; row <= source.length; row += 1) {
    matrix[row][0] = row;
  }

  for (let column = 0; column <= target.length; column += 1) {
    matrix[0][column] = column;
  }

  for (let row = 1; row <= source.length; row += 1) {
    for (let column = 1; column <= target.length; column += 1) {
      const cost = source[row - 1] === target[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost
      );
    }
  }

  return matrix[source.length][target.length];
}

export function similarityScore(left, right) {
  const source = normalizeSearchText(left);
  const target = normalizeSearchText(right);

  if (!source || !target) return 0;
  if (source === target) return 1;

  const distance = levenshteinDistance(source, target);
  return 1 - distance / Math.max(source.length, target.length);
}