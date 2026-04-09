import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from './env.js';

const configDirectory = path.dirname(fileURLToPath(import.meta.url));

export const backendRoot = path.resolve(configDirectory, '..');
export const uploadsDir = path.resolve(backendRoot, env.uploadDir);

export function ensureUploadsDirectory() {
  fs.mkdirSync(uploadsDir, { recursive: true });
}