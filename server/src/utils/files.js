import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { AppError } from './AppError.js';

// Public crop photos live under /uploads/crops. Verification documents are private
// (not served statically): they are only streamed to their owner and to admins.
export const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR || 'uploads');
export const CROP_DIR = path.join(UPLOAD_ROOT, 'crops');
export const DOC_DIR = path.join(UPLOAD_ROOT, 'docs');

export const MAX_FILE_BYTES = 3 * 1024 * 1024;

const startsWith = (buf, bytes, at = 0) => bytes.every((b, i) => buf[at + i] === b);

// The file's real type is read from its first bytes, never from the name or the browser's claim
const TYPES = [
  { ext: 'jpg', mime: 'image/jpeg', is: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  { ext: 'png', mime: 'image/png', is: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { ext: 'webp', mime: 'image/webp', is: (b) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8) },
  { ext: 'pdf', mime: 'application/pdf', is: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46]) },
];

export async function saveUpload(buffer, dir, { allowPdf = false } = {}) {
  const type = TYPES.find((t) => t.is(buffer));
  if (!type || (type.ext === 'pdf' && !allowPdf)) {
    throw new AppError(allowPdf ? 'Only JPG, PNG, WebP or PDF files are allowed' : 'Only JPG, PNG or WebP photos are allowed', 400);
  }
  await fs.mkdir(dir, { recursive: true });
  const name = `${crypto.randomUUID()}.${type.ext}`; // random name: nothing the user typed reaches the disk path
  await fs.writeFile(path.join(dir, name), buffer);
  return { name, mime: type.mime };
}

// Duplicate a stored photo under a new random name (used when a listing is relisted). Returns the new name, or null if the file is gone.
export async function copyUpload(dir, name) {
  try {
    return (await saveUpload(await fs.readFile(path.join(dir, path.basename(String(name)))), dir)).name;
  } catch {
    return null;
  }
}

export const removeFile = (dir, name) => fs.unlink(path.join(dir, path.basename(String(name)))).catch(() => {});

const memory = (files) => multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files } });
export const cropPhotos = memory(4).array('images', 4);
export const documents = memory(3).array('files', 3);
