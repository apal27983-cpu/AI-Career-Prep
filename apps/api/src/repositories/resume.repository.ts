import type { Prisma, ProcessingStatus } from '@prisma/client';
import type { ParsedResume } from '@career-prep/shared';
import { prisma } from '../config/prisma.js';

/**
 * Every read filters on userId as well as id, so an id guessed from another
 * account simply returns nothing.
 */
export async function findResumeForUser(userId: string, resumeId: string) {
  return prisma.resume.findFirst({ where: { id: resumeId, userId } });
}

export async function listResumesForUser(userId: string) {
  return prisma.resume.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      originalFilename: true,
      mimeType: true,
      fileSize: true,
      processingStatus: true,
      processingError: true,
      createdAt: true,
      updatedAt: true,
      extractedText: true,
    },
  });
}

export async function latestCompletedResume(userId: string) {
  return prisma.resume.findFirst({
    where: { userId, processingStatus: 'COMPLETED' },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createResume(input: {
  userId: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  extractedText: string;
  parsedData: ParsedResume;
  storageKey: string | null;
  processingStatus: ProcessingStatus;
  processingError?: string | null;
}) {
  return prisma.resume.create({
    data: {
      ...input,
      parsedData: input.parsedData as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function updateParsedData(userId: string, resumeId: string, parsedData: ParsedResume) {
  const result = await prisma.resume.updateMany({
    where: { id: resumeId, userId },
    data: { parsedData: parsedData as unknown as Prisma.InputJsonValue },
  });
  return result.count > 0;
}

/** Replaces parsed data for a resume the user owns, returning the fresh row. */
export async function updateParsedForOwner(
  userId: string,
  resumeId: string,
  parsedData: ParsedResume,
) {
  const updated = await prisma.resume.updateMany({
    where: { id: resumeId, userId },
    data: { parsedData: parsedData as unknown as Prisma.InputJsonValue },
  });
  if (updated.count === 0) return null;
  return prisma.resume.findFirst({ where: { id: resumeId, userId } });
}

export async function deleteResume(userId: string, resumeId: string) {
  const result = await prisma.resume.deleteMany({ where: { id: resumeId, userId } });
  return result.count > 0;
}

export async function countResumes(userId: string) {
  return prisma.resume.count({ where: { userId } });
}

export async function allStorageKeys(): Promise<Set<string>> {
  const rows = await prisma.resume.findMany({
    where: { storageKey: { not: null } },
    select: { storageKey: true },
  });
  return new Set(rows.map((row) => row.storageKey as string));
}
