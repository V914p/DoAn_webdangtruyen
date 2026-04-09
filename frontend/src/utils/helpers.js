import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

export const formatRelative = (value) => dayjs(value).fromNow?.() || dayjs(value).format('DD/MM/YYYY HH:mm');

export const formatDate = (value) => dayjs(value).format('DD MMM YYYY');

export const formatCount = (value = 0) => {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(value);
};

export const slugify = (value = '') =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9- ]/g, '')
    .replace(/\s+/g, '-');

export const createId = (prefix = 'id') => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
