import multer from 'multer';
import { SUPPORTED_RESUME_MIME_TYPES } from '@career-prep/shared';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

/**
 * Uploads are buffered in memory, never written to a temp path under a
 * client-supplied name. The service decides whether to persist the bytes and
 * under which server-generated key.
 */
export const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env().maxResumeBytes,
    files: 1,
    fields: 5,
    parts: 10,
  },
  fileFilter: (_req, file, callback) => {
    if (!(SUPPORTED_RESUME_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      callback(
        new AppError('UNSUPPORTED_MEDIA_TYPE', 'Only PDF and DOCX resumes are supported.'),
      );
      return;
    }
    callback(null, true);
  },
}).single('resume');
