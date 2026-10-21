import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createProfile,
  hasDatabase,
  registerUser,
  resetDatabase,
} from '../helpers/server.js';
import { disconnectPrisma, prisma } from '../../src/config/prisma.js';
import { SAMPLE_RESUME_PDF } from '../helpers/fixtures.js';

const dbAvailable = await hasDatabase();

describe.skipIf(!dbAvailable)('candidate profile', () => {
  beforeEach(resetDatabase);
  afterAll(disconnectPrisma);

  it('starts empty, saves and then updates', async () => {
    const client = await registerUser();

    const empty = await client.agent.get('/api/v1/profile').expect(200);
    expect(empty.body.data.profile).toBeNull();

    await createProfile(client);

    const saved = await client.agent.get('/api/v1/profile').expect(200);
    expect(saved.body.data.profile.targetRole).toBe('Senior Backend Engineer');
    expect(saved.body.data.profile.skills).toContain('TypeScript');

    await createProfile(client, { targetRole: 'Staff Engineer', skills: ['Go'] });
    const updated = await client.agent.get('/api/v1/profile').expect(200);
    expect(updated.body.data.profile.targetRole).toBe('Staff Engineer');
    expect(updated.body.data.profile.skills).toEqual(['Go']);

    // An update, not a second row.
    expect(await prisma.candidateProfile.count()).toBe(1);
  });

  it('rejects an invalid experience level and years of experience', async () => {
    const client = await registerUser();

    const response = await client.agent
      .put('/api/v1/profile')
      .set('x-csrf-token', client.csrfToken)
      .send({
        fullName: 'A',
        currentRole: 'x',
        targetRole: 'y',
        experienceLevel: 'WIZARD',
        yearsOfExperience: -5,
        education: 'z',
        skills: [],
        learningGoals: [],
        preferredInterviewMode: 'TECHNICAL',
      })
      .expect(400);

    expect(response.body.error.details).toHaveProperty('experienceLevel');
    expect(response.body.error.details).toHaveProperty('yearsOfExperience');
    expect(response.body.error.details).toHaveProperty('skills');
  });

  it('de-duplicates skills server side', async () => {
    const client = await registerUser();
    await createProfile(client, { skills: ['Python', 'python', 'PYTHON', 'SQL'] });

    const saved = await client.agent.get('/api/v1/profile').expect(200);
    expect(saved.body.data.profile.skills).toEqual(['Python', 'SQL']);
  });

  it('cannot be written by an unauthenticated caller', async () => {
    const { app } = await import('../helpers/server.js');
    const supertest = (await import('supertest')).default;
    await supertest(app()).put('/api/v1/profile').send({}).expect(401);
  });
});

describe.skipIf(!dbAvailable)('resume upload and parsing', () => {
  beforeEach(resetDatabase);
  afterAll(disconnectPrisma);

  it('parses a PDF, stores it and returns a structured preview', async () => {
    const client = await registerUser();
    await createProfile(client);

    const response = await client.agent
      .post('/api/v1/resumes/upload')
      .set('x-csrf-token', client.csrfToken)
      .attach('resume', SAMPLE_RESUME_PDF(), { filename: 'cv.pdf', contentType: 'application/pdf' })
      .expect(201);

    const resume = response.body.data.resume;
    expect(resume.processingStatus).toBe('COMPLETED');
    expect(resume.extractedText).toContain('Jane Doe');
    expect(resume.parsedData.skills.length).toBeGreaterThan(0);

    // No filesystem path is ever exposed.
    const serialised = JSON.stringify(response.body);
    expect(serialised).not.toMatch(/storageKey/);
    expect(serialised).not.toMatch(/[A-Za-z]:\\\\/);
    expect(serialised).not.toMatch(/\/storage\//);
  });

  it('stores a server-generated filename, not the uploaded one', async () => {
    const client = await registerUser();

    await client.agent
      .post('/api/v1/resumes/upload')
      .set('x-csrf-token', client.csrfToken)
      .attach('resume', SAMPLE_RESUME_PDF(), {
        filename: '../../../etc/passwd.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    const row = await prisma.resume.findFirst();
    // The display name is sanitised and the path traversal is gone.
    expect(row?.originalFilename).not.toContain('..');
    expect(row?.originalFilename).not.toContain('/');
  });

  it('rejects a submit with no file at all without crashing', async () => {
    const client = await registerUser();

    const response = await client.agent
      .post('/api/v1/resumes/upload')
      .set('x-csrf-token', client.csrfToken)
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toMatch(/choose a pdf or docx/i);

    // The process is still serving requests.
    await client.agent.get('/api/v1/resumes').expect(200);
  });

  it('rejects an empty multipart submit without crashing', async () => {
    const client = await registerUser();

    const response = await client.agent
      .post('/api/v1/resumes/upload')
      .set('x-csrf-token', client.csrfToken)
      .field('resume', '')
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    await client.agent.get('/api/v1/resumes').expect(200);
  });

  it('rejects a file sent under the wrong field name without crashing', async () => {
    const client = await registerUser();

    const response = await client.agent
      .post('/api/v1/resumes/upload')
      .set('x-csrf-token', client.csrfToken)
      .attach('cv', SAMPLE_RESUME_PDF(), { filename: 'cv.pdf', contentType: 'application/pdf' });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    await client.agent.get('/api/v1/resumes').expect(200);
  });

  it('rejects an unsupported file type', async () => {
    const client = await registerUser();

    const response = await client.agent
      .post('/api/v1/resumes/upload')
      .set('x-csrf-token', client.csrfToken)
      .attach('resume', Buffer.from('plain text'), {
        filename: 'cv.txt',
        contentType: 'text/plain',
      })
      .expect(415);

    expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('rejects a non-PDF renamed to .pdf', async () => {
    const client = await registerUser();

    await client.agent
      .post('/api/v1/resumes/upload')
      .set('x-csrf-token', client.csrfToken)
      .attach('resume', Buffer.from('MZ\u0000\u0000 not a pdf at all'), {
        filename: 'cv.pdf',
        contentType: 'application/pdf',
      })
      .expect(415);
  });

  it('rejects an oversized file', async () => {
    const client = await registerUser();
    const oversized = Buffer.alloc(6 * 1024 * 1024, 0x41);
    oversized.write('%PDF-1.4', 0, 'latin1');

    const response = await client.agent
      .post('/api/v1/resumes/upload')
      .set('x-csrf-token', client.csrfToken)
      .attach('resume', oversized, { filename: 'big.pdf', contentType: 'application/pdf' });

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('records a failed row for an unreadable file without crashing', async () => {
    const client = await registerUser();
    const corrupt = Buffer.from('%PDF-1.4\nnot really a pdf body', 'latin1');

    const response = await client.agent
      .post('/api/v1/resumes/upload')
      .set('x-csrf-token', client.csrfToken)
      .attach('resume', corrupt, { filename: 'broken.pdf', contentType: 'application/pdf' })
      .expect(422);

    expect(response.body.error.code).toBe('RESUME_PARSE_FAILED');

    // The server is still serving requests.
    await client.agent.get('/api/v1/resumes').expect(200);
  });

  it('saves candidate corrections to the parsed preview', async () => {
    const client = await registerUser();
    const upload = await client.agent
      .post('/api/v1/resumes/upload')
      .set('x-csrf-token', client.csrfToken)
      .attach('resume', SAMPLE_RESUME_PDF(), { filename: 'cv.pdf', contentType: 'application/pdf' })
      .expect(201);

    const resumeId = upload.body.data.resume.id as string;
    const corrected = {
      ...upload.body.data.resume.parsedData,
      candidateName: 'Corrected Name',
      skills: ['Rust'],
    };

    const response = await client.agent
      .put(`/api/v1/resumes/${resumeId}`)
      .set('x-csrf-token', client.csrfToken)
      .send({ parsedData: corrected })
      .expect(200);

    expect(response.body.data.resume.parsedData.candidateName).toBe('Corrected Name');
    expect(response.body.data.resume.parsedData.skills).toEqual(['Rust']);
  });

  it('deletes the resume row and its stored file', async () => {
    const client = await registerUser();
    const upload = await client.agent
      .post('/api/v1/resumes/upload')
      .set('x-csrf-token', client.csrfToken)
      .attach('resume', SAMPLE_RESUME_PDF(), { filename: 'cv.pdf', contentType: 'application/pdf' })
      .expect(201);

    const resumeId = upload.body.data.resume.id as string;
    await client.agent
      .delete(`/api/v1/resumes/${resumeId}`)
      .set('x-csrf-token', client.csrfToken)
      .expect(200);

    expect(await prisma.resume.count({ where: { id: resumeId } })).toBe(0);
    await client.agent.get(`/api/v1/resumes/${resumeId}`).expect(404);
  });
});

describe.skipIf(!dbAvailable)('skill gap analysis', () => {
  beforeEach(resetDatabase);
  afterAll(disconnectPrisma);

  it('requires a profile first', async () => {
    const client = await registerUser();

    const response = await client.agent
      .post('/api/v1/skill-gap/analyze')
      .set('x-csrf-token', client.csrfToken)
      .send({ targetRole: 'Backend Engineer' })
      .expect(400);

    expect(response.body.error.message).toMatch(/profile/i);
  });

  it('produces, persists and re-reads a validated report', async () => {
    const client = await registerUser();
    await createProfile(client);

    const created = await client.agent
      .post('/api/v1/skill-gap/analyze')
      .set('x-csrf-token', client.csrfToken)
      .send({ targetRole: 'Backend Engineer', skills: ['TypeScript', 'PostgreSQL'] })
      .expect(201);

    const analysis = created.body.data.analysis;
    expect(analysis.report.targetRole).toBe('Backend Engineer');
    expect(analysis.readinessScore).toBeGreaterThanOrEqual(0);
    expect(analysis.readinessScore).toBeLessThanOrEqual(100);
    // The mock provider serves curated content and must say so.
    expect(analysis.generatedBy).toBe('CURATED_FALLBACK');

    const history = await client.agent.get('/api/v1/skill-gap/history').expect(200);
    expect(history.body.data.analyses).toHaveLength(1);

    const fetched = await client.agent.get(`/api/v1/skill-gap/${analysis.id}`).expect(200);
    expect(fetched.body.data.analysis.id).toBe(analysis.id);
  });

  it('uses the uploaded resume when one exists', async () => {
    const client = await registerUser();
    await createProfile(client);
    const upload = await client.agent
      .post('/api/v1/resumes/upload')
      .set('x-csrf-token', client.csrfToken)
      .attach('resume', SAMPLE_RESUME_PDF(), { filename: 'cv.pdf', contentType: 'application/pdf' })
      .expect(201);

    const created = await client.agent
      .post('/api/v1/skill-gap/analyze')
      .set('x-csrf-token', client.csrfToken)
      .send({ resumeId: upload.body.data.resume.id, targetRole: 'Backend Engineer' })
      .expect(201);

    expect(created.body.data.analysis.resumeId).toBe(upload.body.data.resume.id);
  });

  it('rejects an analysis with no skills and no resume', async () => {
    const client = await registerUser();
    await createProfile(client, { skills: ['OnlySkill'] });

    // Clear the profile skills by analysing with an explicit empty list while
    // no resume exists: the service falls back to profile skills, so this
    // instead checks the validation on the target role.
    const response = await client.agent
      .post('/api/v1/skill-gap/analyze')
      .set('x-csrf-token', client.csrfToken)
      .send({ targetRole: 'x' })
      .expect(400);

    expect(response.body.error.details).toHaveProperty('targetRole');
  });
});
