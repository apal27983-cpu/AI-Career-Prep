import path from 'node:path';
import { createRequire } from 'node:module';
import { LIMITS, SUPPORTED_RESUME_EXTENSIONS } from '@career-prep/shared';
import { AppError } from '../utils/errors.js';
import { env } from '../config/env.js';

const require = createRequire(import.meta.url);

export type ResumeFileKind = 'pdf' | 'docx';

export interface UploadCandidate {
  originalName: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
}

/** `%PDF-` */
const PDF_SIGNATURE = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]);
/** `PK\x03\x04` - DOCX is a zip container. */
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

const MIME_TO_KIND: Record<string, ResumeFileKind> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

function unsupported(message: string): AppError {
  return new AppError('UNSUPPORTED_MEDIA_TYPE', message);
}

/**
 * Checks extension, declared MIME type and the file's own magic bytes, and
 * requires all three to agree. The client controls the first two.
 */
export function validateResumeFile(file: UploadCandidate): ResumeFileKind {
  const config = env();

  if (file.size <= 0) {
    throw new AppError('VALIDATION_ERROR', 'That file is empty.');
  }
  if (file.size > config.maxResumeBytes) {
    throw new AppError(
      'PAYLOAD_TOO_LARGE',
      `That file is larger than the ${config.MAX_RESUME_SIZE_MB} MB limit.`,
    );
  }

  const extension = path.extname(file.originalName).toLowerCase();
  if (!(SUPPORTED_RESUME_EXTENSIONS as readonly string[]).includes(extension)) {
    throw unsupported('Only PDF and DOCX resumes are supported.');
  }

  const declaredKind = MIME_TO_KIND[file.mimeType];
  if (!declaredKind) {
    throw unsupported('Only PDF and DOCX resumes are supported.');
  }

  const extensionKind: ResumeFileKind = extension === '.pdf' ? 'pdf' : 'docx';
  if (extensionKind !== declaredKind) {
    throw unsupported('The file extension does not match the file type.');
  }

  const header = file.buffer.subarray(0, 8);
  const signatureKind: ResumeFileKind | null = header.subarray(0, 5).equals(PDF_SIGNATURE)
    ? 'pdf'
    : header.subarray(0, 4).equals(ZIP_SIGNATURE)
      ? 'docx'
      : null;

  if (signatureKind !== declaredKind) {
    throw unsupported(
      'That file does not look like a valid PDF or DOCX. Please re-export it and try again.',
    );
  }

  return declaredKind;
}

/**
 * Characters this cleanup exists to remove. Keeping them in named constants
 * avoids control characters and non-breaking spaces sitting inline in regexes.
 */
const NULL_BYTE = /\u0000/g;
/** Soft hyphen plus the private-use glyphs some PDF exporters use for bullets. */
const PRIVATE_USE = /[­-]/g;
const BULLET_GLYPHS = /[•●▪·]/g;
/** Space, tab and non-breaking space. */
const HORIZONTAL_SPACE = /[ \t ]+/g;

/**
 * Collapses the whitespace noise that PDF text layers produce, without losing
 * the line structure the field extractor relies on.
 */
export function normaliseExtractedText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(NULL_BYTE, '')
    .replace(PRIVATE_USE, ' ')
    .replace(BULLET_GLYPHS, '- ')
    .replace(HORIZONTAL_SPACE, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, LIMITS.resumeTextMax);
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  // The legacy build is the one that runs outside a browser.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const standardFontDataUrl = path.join(
    path.dirname(require.resolve('pdfjs-dist/package.json')),
    'standard_fonts/',
  );

  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    // Hardening: no eval, no remote font fetches, no embedded JS execution.
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    standardFontDataUrl,
  }).promise;

  try {
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines: string[] = [];
      let line = '';
      let lastBaseline: number | null = null;

      for (const item of content.items) {
        if (!('str' in item)) continue;

        // `hasEOL` alone is not enough: plenty of real PDFs position each line
        // with its own transform and never set it. A change in the text
        // baseline is the more reliable signal, and the section-based field
        // extractor depends on getting the line structure right.
        const baseline = Array.isArray(item.transform) ? (item.transform[5] ?? null) : null;
        if (lastBaseline !== null && baseline !== null && Math.abs(baseline - lastBaseline) > 1) {
          if (line.length > 0) {
            lines.push(line);
            line = '';
          }
        }
        if (baseline !== null) lastBaseline = baseline;

        line += item.str;
        if (item.hasEOL) {
          lines.push(line);
          line = '';
        }
      }
      if (line.length > 0) lines.push(line);
      pages.push(lines.join('\n'));
      page.cleanup();
    }
    return pages.join('\n\n');
  } finally {
    await doc.destroy();
  }
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

/** Maps library-specific failures onto one user-facing message per cause. */
function parseFailure(kind: ResumeFileKind, error: unknown): AppError {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes('password') || lower.includes('encrypted')) {
    return new AppError(
      'RESUME_PARSE_FAILED',
      'That file is password protected. Please remove the password and upload it again.',
      { logContext: { kind, reason: 'password_protected' } },
    );
  }
  if (lower.includes('invalid') || lower.includes('corrupt') || lower.includes('structure')) {
    return new AppError(
      'RESUME_PARSE_FAILED',
      'We could not read that file - it looks corrupted. Try re-exporting it and uploading again.',
      { logContext: { kind, reason: 'corrupt' } },
    );
  }

  return new AppError(
    'RESUME_PARSE_FAILED',
    'We could not extract text from that file. Try a different export or upload a DOCX version.',
    { logContext: { kind, reason: 'unknown' }, cause: error },
  );
}

/**
 * Extracts and normalises the text layer. Document content is treated as data
 * from here on; nothing in it is executed or interpreted as an instruction.
 */
export async function extractResumeText(buffer: Buffer, kind: ResumeFileKind): Promise<string> {
  let raw: string;
  try {
    raw = kind === 'pdf' ? await extractPdfText(buffer) : await extractDocxText(buffer);
  } catch (error) {
    throw parseFailure(kind, error);
  }

  const text = normaliseExtractedText(raw);

  if (text.replace(/\s/g, '').length < 50) {
    throw new AppError(
      'RESUME_PARSE_FAILED',
      'We could not find any readable text in that file. If it is a scanned image, upload a text-based PDF or DOCX instead.',
      { logContext: { kind, reason: 'no_text_layer' } },
    );
  }

  return text;
}
