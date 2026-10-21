import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Resumes are written to a private directory that is never served statically.
 * The key is generated here: the original filename is only ever stored as a
 * display string, so a crafted name cannot influence the path on disk.
 */
function storageRoot(): string {
  return path.resolve(process.cwd(), env().RESUME_STORAGE_DIR);
}

function userDir(userId: string): string {
  // userId is a uuid from our own database, so it cannot contain separators.
  return path.join(storageRoot(), userId);
}

export function extensionFor(mimeType: string): string {
  return mimeType === 'application/pdf' ? '.pdf' : '.docx';
}

/** Rejects anything that would escape the storage root. */
function assertInsideStorage(absolutePath: string): void {
  const root = storageRoot();
  const relative = path.relative(root, absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Refusing to touch a path outside the resume storage directory');
  }
}

export interface StoredFile {
  storageKey: string;
}

export async function storeResumeFile(
  userId: string,
  buffer: Buffer,
  mimeType: string,
): Promise<StoredFile> {
  const storageKey = path.posix.join(userId, `${randomUUID()}${extensionFor(mimeType)}`);
  const absolute = path.join(storageRoot(), storageKey);
  assertInsideStorage(absolute);

  await mkdir(userDir(userId), { recursive: true });
  // 0o600: readable only by the service account that wrote it.
  await writeFile(absolute, buffer, { mode: 0o600 });

  return { storageKey };
}

export async function deleteResumeFile(storageKey: string | null): Promise<void> {
  if (!storageKey) return;
  const absolute = path.join(storageRoot(), storageKey);
  try {
    assertInsideStorage(absolute);
    await rm(absolute, { force: true });
  } catch (error) {
    logger.warn({ err: error }, 'Could not delete a stored resume file');
  }
}

export async function deleteAllResumeFilesForUser(userId: string): Promise<void> {
  const dir = userDir(userId);
  try {
    assertInsideStorage(dir);
    await rm(dir, { recursive: true, force: true });
  } catch (error) {
    logger.warn({ err: error, userId }, 'Could not delete the resume directory for a user');
  }
}

/**
 * Removes stored files that no longer have a database row. Safe to call on
 * startup; it only ever deletes inside the storage root.
 */
export async function cleanupOrphanedFiles(knownKeys: Set<string>): Promise<number> {
  const root = storageRoot();
  let removed = 0;
  try {
    const users = await readdir(root, { withFileTypes: true });
    for (const userEntry of users) {
      if (!userEntry.isDirectory()) continue;
      const files = await readdir(path.join(root, userEntry.name));
      for (const file of files) {
        const key = path.posix.join(userEntry.name, file);
        if (knownKeys.has(key)) continue;
        await deleteResumeFile(key);
        removed += 1;
      }
    }
  } catch {
    // The directory may simply not exist yet. Nothing to clean up.
  }
  return removed;
}
