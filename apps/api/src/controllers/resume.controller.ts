import type { Request, Response } from 'express';
import {
  emptyParsedResume,
  parsedResumeSchema,
  type ParsedResume,
  type ResumeDetail,
  type ResumeSummary,
  type UpdateResumeInput,
} from '@career-prep/shared';
import { sendSuccess } from '../utils/http.js';
import { currentUser } from '../middleware/auth.middleware.js';
import { AppError, notFound } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import {
  extractResumeText,
  validateResumeFile,
  type UploadCandidate,
} from '../services/documentParser.service.js';
import { extractResumeFields } from '../services/resumeExtraction.service.js';
import { deleteResumeFile, storeResumeFile } from '../services/resumeStorage.service.js';
import {
  createResume,
  deleteResume,
  findResumeForUser,
  listResumesForUser,
  updateParsedData,
  updateParsedForOwner,
} from '../repositories/resume.repository.js';

type ResumeRow = NonNullable<Awaited<ReturnType<typeof findResumeForUser>>>;

/** Reading parsed data back out of JSON: fall back to empty rather than throwing. */
function readParsedData(value: unknown): ParsedResume {
  const result = parsedResumeSchema.safeParse(value);
  return result.success ? result.data : emptyParsedResume();
}

function toSummary(row: {
  id: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  processingStatus: string;
  processingError: string | null;
  createdAt: Date;
  updatedAt: Date;
  extractedText: string;
}): ResumeSummary {
  return {
    id: row.id,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    processingStatus: row.processingStatus as ResumeSummary['processingStatus'],
    processingError: row.processingError,
    // The length is useful in the UI; the text itself stays out of list responses.
    textLength: row.extractedText.length,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDetail(row: ResumeRow): ResumeDetail {
  return {
    ...toSummary(row),
    extractedText: row.extractedText,
    parsedData: readParsedData(row.parsedData),
  };
}

/**
 * Sanitises the name purely for display. The value never influences a path:
 * storage keys are generated server side.
 */
function safeDisplayName(originalName: string): string {
  const base = originalName.split(/[\\/]/).pop() ?? 'resume';
  return base.replace(/[^\w.\- ()]/g, '_').slice(0, 260) || 'resume';
}

export async function uploadResume(req: Request, res: Response): Promise<void> {
  const { id: userId } = currentUser(req);
  const file = req.file;

  if (!file) {
    throw new AppError('VALIDATION_ERROR', 'Choose a PDF or DOCX resume to upload.');
  }

  const candidate: UploadCandidate = {
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    buffer: file.buffer,
  };

  const kind = validateResumeFile(candidate);
  const displayName = safeDisplayName(file.originalname);

  let storageKey: string | null = null;
  try {
    const text = await extractResumeText(candidate.buffer, kind);
    const parsedData = extractResumeFields(text);

    if (env().RESUME_STORAGE_MODE === 'disk') {
      ({ storageKey } = await storeResumeFile(userId, candidate.buffer, candidate.mimeType));
    }

    const row = await createResume({
      userId,
      originalFilename: displayName,
      mimeType: candidate.mimeType,
      fileSize: candidate.size,
      extractedText: text,
      parsedData,
      storageKey,
      processingStatus: 'COMPLETED',
    });

    logger.info(
      { userId, resumeId: row.id, kind, bytes: candidate.size },
      'Resume uploaded and parsed',
    );
    sendSuccess(res, { resume: toDetail(row) }, 'Resume parsed. Review the details below.', 201);
  } catch (error) {
    // Nothing half-written is left behind on a failed parse.
    await deleteResumeFile(storageKey);

    if (error instanceof AppError && error.code === 'RESUME_PARSE_FAILED') {
      // Keeping a FAILED row lets the UI show what went wrong and offer a retry.
      // The message is the user-facing one, so it is safe to store and display.
      await createResume({
        userId,
        originalFilename: displayName,
        mimeType: candidate.mimeType,
        fileSize: candidate.size,
        extractedText: '',
        parsedData: emptyParsedResume(),
        storageKey: null,
        processingStatus: 'FAILED',
        processingError: error.message.slice(0, 400),
      }).catch(() => undefined);
    }
    throw error;
  } finally {
    // Release the buffer promptly; it holds personal data.
    if (req.file) req.file.buffer = Buffer.alloc(0);
  }
}

export async function listResumes(req: Request, res: Response): Promise<void> {
  const { id: userId } = currentUser(req);
  const rows = await listResumesForUser(userId);
  sendSuccess(res, { resumes: rows.map(toSummary) });
}

export async function getResume(req: Request, res: Response): Promise<void> {
  const { id: userId } = currentUser(req);
  const row = await findResumeForUser(userId, req.params.resumeId as string);
  if (!row) throw notFound('That resume could not be found.');
  sendSuccess(res, { resume: toDetail(row) });
}

export async function patchResume(req: Request, res: Response): Promise<void> {
  const { id: userId } = currentUser(req);
  const resumeId = req.params.resumeId as string;
  const body = req.body as UpdateResumeInput;

  const updated = await updateParsedData(userId, resumeId, body.parsedData);
  if (!updated) throw notFound('That resume could not be found.');

  const row = await findResumeForUser(userId, resumeId);
  if (!row) throw notFound('That resume could not be found.');

  sendSuccess(res, { resume: toDetail(row) }, 'Your corrections have been saved.');
}

/**
 * Re-runs extraction over the text already stored for this resume. Useful when
 * the parser has improved since the file was uploaded, and it needs no re-upload
 * because the extracted text is kept. It DOES discard manual corrections, which
 * is why it is an explicit action rather than something that happens silently.
 */
export async function reparseResume(req: Request, res: Response): Promise<void> {
  const { id: userId } = currentUser(req);
  const resumeId = req.params.resumeId as string;

  const row = await findResumeForUser(userId, resumeId);
  if (!row) throw notFound('That resume could not be found.');

  if (row.extractedText.trim().length === 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      'There is no stored text for that resume. Please upload the file again.',
    );
  }

  const updated = await updateParsedForOwner(
    userId,
    resumeId,
    extractResumeFields(row.extractedText),
  );
  if (!updated) throw notFound('That resume could not be found.');

  logger.info({ userId, resumeId }, 'Resume re-parsed from stored text');
  sendSuccess(res, { resume: toDetail(updated) }, 'We re-read your file with the latest parser.');
}

export async function removeResume(req: Request, res: Response): Promise<void> {
  const { id: userId } = currentUser(req);
  const resumeId = req.params.resumeId as string;

  const row = await findResumeForUser(userId, resumeId);
  if (!row) throw notFound('That resume could not be found.');

  const deleted = await deleteResume(userId, resumeId);
  if (!deleted) throw notFound('That resume could not be found.');
  await deleteResumeFile(row.storageKey);

  logger.info({ userId, resumeId }, 'Resume deleted');
  sendSuccess(res, { deleted: true }, 'Resume and the stored file have been deleted.');
}
