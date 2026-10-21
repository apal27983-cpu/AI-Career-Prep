import { describe, expect, it } from 'vitest';
import {
  extractResumeText,
  normaliseExtractedText,
  validateResumeFile,
  type UploadCandidate,
} from '../../src/services/documentParser.service.js';
import { AppError } from '../../src/utils/errors.js';
import { buildTestPdf } from '../helpers/fixtures.js';

const PDF_MIME = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function candidate(overrides: Partial<UploadCandidate> = {}): UploadCandidate {
  const buffer = overrides.buffer ?? buildTestPdf('Jane Doe');
  return {
    originalName: 'resume.pdf',
    mimeType: PDF_MIME,
    size: buffer.length,
    buffer,
    ...overrides,
  };
}

describe('validateResumeFile', () => {
  it('accepts a PDF whose extension, MIME type and signature agree', () => {
    expect(validateResumeFile(candidate())).toBe('pdf');
  });

  it('rejects an unsupported extension', () => {
    const file = candidate({ originalName: 'resume.txt' });
    expect(() => validateResumeFile(file)).toThrowError(/Only PDF and DOCX/);
  });

  it('rejects an unsupported MIME type', () => {
    const file = candidate({ mimeType: 'text/plain', originalName: 'resume.pdf' });
    expect(() => validateResumeFile(file)).toThrowError(/Only PDF and DOCX/);
  });

  it('rejects a file whose extension contradicts its MIME type', () => {
    const file = candidate({ originalName: 'resume.docx', mimeType: PDF_MIME });
    expect(() => validateResumeFile(file)).toThrowError(/extension does not match/);
  });

  it('rejects a file renamed to .pdf that is not a PDF', () => {
    const file = candidate({ buffer: Buffer.from('<?php system($_GET[0]); ?>', 'utf8') });
    expect(() => validateResumeFile(file)).toThrowError(/does not look like a valid PDF or DOCX/);
  });

  it('rejects a file over the configured size limit', () => {
    const file = candidate({ size: 50 * 1024 * 1024 });
    try {
      validateResumeFile(file);
      expect.unreachable('expected a PAYLOAD_TOO_LARGE error');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('PAYLOAD_TOO_LARGE');
    }
  });

  it('rejects an empty file', () => {
    const file = candidate({ size: 0 });
    expect(() => validateResumeFile(file)).toThrowError(/empty/);
  });

  it('identifies a DOCX by its zip signature', () => {
    const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(100)]);
    const file = candidate({ originalName: 'cv.docx', mimeType: DOCX_MIME, buffer: zip, size: zip.length });
    expect(validateResumeFile(file)).toBe('docx');
  });
});

describe('normaliseExtractedText', () => {
  it('collapses whitespace while keeping line structure', () => {
    const input = 'Jane   Doe\r\n\r\n\r\n\r\nSkills:\t Python,  SQL   ';
    expect(normaliseExtractedText(input)).toBe('Jane Doe\n\nSkills: Python, SQL');
  });

  it('turns bullet glyphs into plain dashes', () => {
    expect(normaliseExtractedText('• Built an API')).toBe('- Built an API');
  });

  it('strips null bytes', () => {
    expect(normaliseExtractedText('Jane\u0000Doe')).toBe('JaneDoe');
  });
});

describe('extractResumeText', () => {
  it('extracts the text layer from a PDF', async () => {
    const text = await extractResumeText(
      buildTestPdf('Jane Doe Senior Backend Engineer Python Docker Kubernetes AWS'),
      'pdf',
    );
    expect(text).toContain('Jane Doe');
    expect(text).toContain('Python');
  });

  it('reports a helpful error for a corrupt PDF rather than crashing', async () => {
    const corrupt = Buffer.concat([
      Buffer.from('%PDF-1.4\n', 'latin1'),
      Buffer.from('this is not a pdf body at all', 'utf8'),
    ]);

    await expect(extractResumeText(corrupt, 'pdf')).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof AppError && error.code === 'RESUME_PARSE_FAILED',
    );
  });

  it('reports a helpful error when a PDF has no usable text layer', async () => {
    await expect(extractResumeText(buildTestPdf('Hi'), 'pdf')).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof AppError &&
        error.code === 'RESUME_PARSE_FAILED' &&
        /readable text/.test(error.message),
    );
  });

  it('reports a helpful error for a DOCX that is not a real zip', async () => {
    const fake = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(200)]);
    await expect(extractResumeText(fake, 'docx')).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof AppError && error.code === 'RESUME_PARSE_FAILED',
    );
  });
});
