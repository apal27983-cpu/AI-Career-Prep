import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import { app, createProfile, hasDatabase, registerUser, resetDatabase } from '../helpers/server.js';
import { disconnectPrisma, prisma } from '../../src/config/prisma.js';
import { SAMPLE_RESUME_PDF } from '../helpers/fixtures.js';

const dbAvailable = await hasDatabase();

const PROTECTED_ROUTES: Array<[string, string]> = [
  ['get', '/api/v1/profile'],
  ['put', '/api/v1/profile'],
  ['get', '/api/v1/dashboard'],
  ['get', '/api/v1/resumes'],
  ['post', '/api/v1/resumes/upload'],
  ['post', '/api/v1/skill-gap/analyze'],
  ['get', '/api/v1/skill-gap/history'],
  ['get', '/api/v1/interviews'],
  ['post', '/api/v1/interviews'],
];

describe.skipIf(!dbAvailable)('authentication is required', () => {
  beforeEach(resetDatabase);
  afterAll(disconnectPrisma);

  it.each(PROTECTED_ROUTES)('%s %s returns 401 without a session', async (method, path) => {
    const request = supertest(app()) as unknown as Record<
      string,
      (url: string) => supertest.Test
    >;
    const response = await request[method]!(path).send({});
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a forged session cookie', async () => {
    await supertest(app())
      .get('/api/v1/profile')
      .set('Cookie', 'career_prep_session=an-attacker-supplied-token-value-padded-out')
      .expect(401);
  });

  it('rejects a state-changing request with no CSRF token', async () => {
    const client = await registerUser();

    const response = await client.agent.put('/api/v1/profile').send({ fullName: 'x' });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_TOKEN_INVALID');
  });

  it('rejects a state-changing request with a wrong CSRF token', async () => {
    const client = await registerUser();

    const response = await client.agent
      .put('/api/v1/profile')
      .set('x-csrf-token', 'a'.repeat(64))
      .send({ fullName: 'x' });
    expect(response.status).toBe(403);
  });

  it('still allows reads without a CSRF token', async () => {
    const client = await registerUser();
    await client.agent.get('/api/v1/profile').expect(200);
  });
});

describe.skipIf(!dbAvailable)('resource ownership', () => {
  beforeEach(resetDatabase);
  afterAll(disconnectPrisma);

  it('does not let one user read another resume', async () => {
    const alice = await registerUser();
    const bob = await registerUser();

    const upload = await alice.agent
      .post('/api/v1/resumes/upload')
      .set('x-csrf-token', alice.csrfToken)
      .attach('resume', SAMPLE_RESUME_PDF(), { filename: 'cv.pdf', contentType: 'application/pdf' })
      .expect(201);

    const resumeId = upload.body.data.resume.id as string;

    // 404 rather than 403: the API does not confirm the record exists.
    await bob.agent.get(`/api/v1/resumes/${resumeId}`).expect(404);
    await bob.agent
      .delete(`/api/v1/resumes/${resumeId}`)
      .set('x-csrf-token', bob.csrfToken)
      .expect(404);

    // Alice's record survived Bob's delete attempt.
    expect(await prisma.resume.count({ where: { id: resumeId } })).toBe(1);
  });

  it('does not let one user review or read another resume fit report', async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    await createProfile(alice);

    const upload = await alice.agent
      .post('/api/v1/resumes/upload')
      .set('x-csrf-token', alice.csrfToken)
      .attach('resume', SAMPLE_RESUME_PDF(), { filename: 'cv.pdf', contentType: 'application/pdf' })
      .expect(201);

    const resumeId = upload.body.data.resume.id as string;

    await alice.agent
      .post(`/api/v1/resumes/${resumeId}/fit`)
      .set('x-csrf-token', alice.csrfToken)
      .send({ targetRole: 'Backend Engineer' })
      .expect(201);

    // Bob can neither run a review on it nor read the one Alice ran.
    await bob.agent
      .post(`/api/v1/resumes/${resumeId}/fit`)
      .set('x-csrf-token', bob.csrfToken)
      .send({ targetRole: 'Backend Engineer' })
      .expect(404);
    await bob.agent.get(`/api/v1/resumes/${resumeId}/fit`).expect(404);
  });

  it('does not let one user read another skill gap report', async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    await createProfile(alice);

    const created = await alice.agent
      .post('/api/v1/skill-gap/analyze')
      .set('x-csrf-token', alice.csrfToken)
      .send({ targetRole: 'Backend Engineer', skills: ['TypeScript'] })
      .expect(201);

    await bob.agent.get(`/api/v1/skill-gap/${created.body.data.analysis.id}`).expect(404);
  });

  it('does not let one user read another interview report', async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    await createProfile(alice);

    const session = await alice.agent
      .post('/api/v1/interviews')
      .set('x-csrf-token', alice.csrfToken)
      .send({
        mode: 'HR',
        targetRole: 'Backend Engineer',
        experienceLevel: 'INTERMEDIATE',
        difficulty: 'MEDIUM',
        totalQuestions: 5,
      })
      .expect(201);

    const sessionId = session.body.data.session.id as string;
    await bob.agent.get(`/api/v1/interviews/${sessionId}`).expect(404);
    await bob.agent.get(`/api/v1/interviews/${sessionId}/report`).expect(404);
  });

  it('does not let one user answer a question in another session', async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    await createProfile(alice);

    const session = await alice.agent
      .post('/api/v1/interviews')
      .set('x-csrf-token', alice.csrfToken)
      .send({
        mode: 'TECHNICAL',
        targetRole: 'Backend Engineer',
        experienceLevel: 'INTERMEDIATE',
        difficulty: 'MEDIUM',
        totalQuestions: 5,
      })
      .expect(201);

    const sessionId = session.body.data.session.id as string;
    const questionId = session.body.data.session.questions[0].id as string;

    await bob.agent
      .post(`/api/v1/interviews/${sessionId}/answer`)
      .set('x-csrf-token', bob.csrfToken)
      .send({ questionId, answerText: 'Trying to write into somebody else history.' })
      .expect(404);

    expect(await prisma.interviewAnswer.count()).toBe(0);
  });

  it('ignores a client-supplied user id', async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    await createProfile(alice);

    // Ownership comes from the session cookie, so this field is simply dropped.
    await bob.agent
      .put('/api/v1/profile')
      .set('x-csrf-token', bob.csrfToken)
      .send({
        userId: alice.userId,
        id: alice.userId,
        fullName: 'Bob',
        currentRole: 'Analyst',
        targetRole: 'Data Analyst',
        experienceLevel: 'ENTRY_LEVEL',
        yearsOfExperience: 1,
        education: 'BSc',
        skills: ['SQL'],
        learningGoals: [],
        preferredInterviewMode: 'APTITUDE',
      })
      .expect(200);

    const aliceProfile = await prisma.candidateProfile.findUnique({
      where: { userId: alice.userId },
    });
    const bobProfile = await prisma.candidateProfile.findUnique({ where: { userId: bob.userId } });

    expect(aliceProfile?.fullName).toBe('Test Candidate');
    expect(bobProfile?.fullName).toBe('Bob');
  });

  it('rejects a malformed resource id instead of running a query with it', async () => {
    const client = await registerUser();

    const response = await client.agent.get('/api/v1/resumes/not-a-uuid').expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe.skipIf(!dbAvailable)('answer keys stay on the server', () => {
  beforeEach(resetDatabase);
  afterAll(disconnectPrisma);

  it('never exposes the aptitude answer key before submission', async () => {
    const client = await registerUser();
    await createProfile(client);

    const created = await client.agent
      .post('/api/v1/interviews')
      .set('x-csrf-token', client.csrfToken)
      .send({
        mode: 'APTITUDE',
        targetRole: 'Analyst',
        experienceLevel: 'ENTRY_LEVEL',
        difficulty: 'EASY',
        totalQuestions: 5,
      })
      .expect(201);

    const sessionId = created.body.data.session.id as string;

    // Check both the create response and a later fetch of the same session.
    const refetched = await client.agent.get(`/api/v1/interviews/${sessionId}`).expect(200);

    for (const body of [created.body, refetched.body]) {
      const serialised = JSON.stringify(body);
      expect(serialised).not.toMatch(/correctOptionIndex/);
      expect(serialised).not.toMatch(/expectedAnswer/);
      expect(serialised).not.toMatch(/gradingMetadata/);
      expect(serialised).not.toMatch(/"rubric"/);
    }

    // And the keys really are stored, so the check above is meaningful.
    const question = await prisma.interviewQuestion.findFirst({ where: { sessionId } });
    const metadata = question?.gradingMetadata as { expectedAnswer: string };
    expect(metadata.expectedAnswer.length).toBeGreaterThan(0);
  });
});
