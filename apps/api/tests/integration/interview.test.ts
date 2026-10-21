import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { INTERVIEW_MODES, MODE_SCORE_DIMENSIONS } from '@career-prep/shared';
import { createProfile, hasDatabase, registerUser, resetDatabase } from '../helpers/server.js';
import { disconnectPrisma, prisma } from '../../src/config/prisma.js';

const dbAvailable = await hasDatabase();

async function startSession(
  client: Awaited<ReturnType<typeof registerUser>>,
  overrides: Record<string, unknown> = {},
) {
  const response = await client.agent
    .post('/api/v1/interviews')
    .set('x-csrf-token', client.csrfToken)
    .send({
      mode: 'TECHNICAL',
      targetRole: 'Backend Engineer',
      experienceLevel: 'INTERMEDIATE',
      difficulty: 'MEDIUM',
      totalQuestions: 5,
      ...overrides,
    })
    .expect(201);

  return response.body.data.session;
}

describe.skipIf(!dbAvailable)('interview sessions', () => {
  beforeEach(resetDatabase);
  afterAll(disconnectPrisma);

  it('creates a session with questions that carry no answer key', async () => {
    const client = await registerUser();
    await createProfile(client);
    const session = await startSession(client);

    expect(session.mode).toBe('TECHNICAL');
    expect(session.status).toBe('IN_PROGRESS');
    expect(session.totalQuestions).toBe(5);
    expect(session.questions.length).toBeGreaterThan(0);

    // The hidden grading metadata must not reach the browser in any form.
    const serialised = JSON.stringify(session);
    expect(serialised).not.toMatch(/expectedAnswer/);
    expect(serialised).not.toMatch(/rubric/);
    expect(serialised).not.toMatch(/correctOptionIndex/);
    expect(serialised).not.toMatch(/gradingMetadata/);

    // The answer key does exist, on the server.
    const stored = await prisma.interviewQuestion.findFirst();
    expect(stored?.gradingMetadata).toHaveProperty('expectedAnswer');
  });

  it.each(INTERVIEW_MODES)('runs a %s session end to end', async (mode) => {
    const client = await registerUser();
    await createProfile(client);
    const session = await startSession(client, { mode, totalQuestions: 5 });

    const question = session.questions[0];
    const answer = await client.agent
      .post(`/api/v1/interviews/${session.id}/answer`)
      .set('x-csrf-token', client.csrfToken)
      .send({
        questionId: question.id,
        answerText:
          'A considered answer that explains the reasoning, gives a concrete example from a ' +
          'previous project, and states the trade-offs that were weighed before deciding.',
        selectedOptionIndex: question.answerFormat === 'MULTIPLE_CHOICE' ? 0 : null,
        idempotencyKey: `key-${mode}-1`,
      })
      .expect(201);

    const evaluation = answer.body.data.answer.evaluation;

    // The three mandatory sections are always present.
    expect(evaluation).toHaveProperty('strengths');
    expect(evaluation).toHaveProperty('weaknesses');
    expect(Array.isArray(evaluation.suggestedImprovements)).toBe(true);
    expect(evaluation.suggestedImprovements.length).toBeGreaterThanOrEqual(1);
    expect(evaluation.suggestedImprovements[0]).toHaveProperty('actionableStep');

    // Scored on this mode's dimensions and no others.
    expect(Object.keys(evaluation.scores).sort()).toEqual([...MODE_SCORE_DIMENSIONS[mode]].sort());
    expect(evaluation.overallScore).toBeGreaterThanOrEqual(0);
    expect(evaluation.overallScore).toBeLessThanOrEqual(100);

    const completed = await client.agent
      .post(`/api/v1/interviews/${session.id}/complete`)
      .set('x-csrf-token', client.csrfToken)
      .expect(200);

    expect(completed.body.data.session.status).toBe('COMPLETED');
    expect(completed.body.data.session.finalSummary).not.toBeNull();

    const report = await client.agent
      .get(`/api/v1/interviews/${session.id}/report`)
      .expect(200);
    expect(report.body.data.session.answers).toHaveLength(1);
  });

  it('grades a multiple-choice aptitude answer against the stored key', async () => {
    const client = await registerUser();
    await createProfile(client);
    const session = await startSession(client, { mode: 'APTITUDE', totalQuestions: 5 });

    const question = session.questions.find(
      (candidate: { answerFormat: string }) => candidate.answerFormat === 'MULTIPLE_CHOICE',
    );
    expect(question).toBeDefined();

    const stored = await prisma.interviewQuestion.findUnique({ where: { id: question.id } });
    const correctIndex = (stored?.gradingMetadata as { correctOptionIndex: number })
      .correctOptionIndex;
    const wrongIndex = correctIndex === 0 ? 1 : 0;

    const response = await client.agent
      .post(`/api/v1/interviews/${session.id}/answer`)
      .set('x-csrf-token', client.csrfToken)
      .send({
        questionId: question.id,
        answerText: question.options[wrongIndex],
        selectedOptionIndex: wrongIndex,
      })
      .expect(201);

    const evaluation = response.body.data.answer.evaluation;
    // Correctness is decided in code, not by the model.
    expect(evaluation.objectiveResult.isCorrect).toBe(false);
    expect(evaluation.scores.correctness).toBe(1);
    // The explanation is only revealed after submitting.
    expect(evaluation.objectiveResult.expectedAnswer).toContain(question.options[correctIndex]);
  });

  it('requires an option to be chosen for a multiple-choice question', async () => {
    const client = await registerUser();
    await createProfile(client);
    const session = await startSession(client, { mode: 'APTITUDE', totalQuestions: 5 });

    const question = session.questions.find(
      (candidate: { answerFormat: string }) => candidate.answerFormat === 'MULTIPLE_CHOICE',
    );

    await client.agent
      .post(`/api/v1/interviews/${session.id}/answer`)
      .set('x-csrf-token', client.csrfToken)
      .send({ questionId: question.id, answerText: 'I think it is five hours' })
      .expect(400);
  });

  it('treats a repeated submission with the same key as a no-op', async () => {
    const client = await registerUser();
    await createProfile(client);
    const session = await startSession(client);
    const question = session.questions[0];

    const payload = {
      questionId: question.id,
      answerText: 'An answer that is long enough to be evaluated properly by the service.',
      idempotencyKey: 'stable-key-123456',
    };

    const first = await client.agent
      .post(`/api/v1/interviews/${session.id}/answer`)
      .set('x-csrf-token', client.csrfToken)
      .send(payload)
      .expect(201);

    const second = await client.agent
      .post(`/api/v1/interviews/${session.id}/answer`)
      .set('x-csrf-token', client.csrfToken)
      .send(payload)
      .expect(200);

    expect(second.body.data.duplicate).toBe(true);
    expect(second.body.data.answer.id).toBe(first.body.data.answer.id);
    expect(await prisma.interviewAnswer.count()).toBe(1);
  });

  it('refuses a second, different answer to the same question', async () => {
    const client = await registerUser();
    await createProfile(client);
    const session = await startSession(client);
    const question = session.questions[0];

    await client.agent
      .post(`/api/v1/interviews/${session.id}/answer`)
      .set('x-csrf-token', client.csrfToken)
      .send({ questionId: question.id, answerText: 'First answer, long enough to evaluate.' })
      .expect(201);

    const response = await client.agent
      .post(`/api/v1/interviews/${session.id}/answer`)
      .set('x-csrf-token', client.csrfToken)
      .send({ questionId: question.id, answerText: 'A different second answer entirely.' })
      .expect(409);

    expect(response.body.error.code).toBe('CONFLICT');
    expect(await prisma.interviewAnswer.count()).toBe(1);
  });

  it('generates further questions on demand without repeating topics', async () => {
    const client = await registerUser();
    await createProfile(client);
    const session = await startSession(client, { totalQuestions: 10 });

    // Answer everything that exists so far.
    for (const question of session.questions) {
      await client.agent
        .post(`/api/v1/interviews/${session.id}/answer`)
        .set('x-csrf-token', client.csrfToken)
        .send({ questionId: question.id, answerText: 'A sufficiently detailed practice answer.' })
        .expect(201);
    }

    const next = await client.agent
      .post(`/api/v1/interviews/${session.id}/next-question`)
      .set('x-csrf-token', client.csrfToken)
      .expect(200);

    expect(next.body.data.generated).toBe(true);

    const topics = await prisma.interviewQuestion.findMany({
      where: { sessionId: session.id },
      select: { topic: true },
    });
    expect(new Set(topics.map((row) => row.topic)).size).toBe(topics.length);
  });

  it('closes a session with no answers instead of inventing a report', async () => {
    const client = await registerUser();
    await createProfile(client);
    const session = await startSession(client);

    const response = await client.agent
      .post(`/api/v1/interviews/${session.id}/complete`)
      .set('x-csrf-token', client.csrfToken)
      .expect(200);

    expect(response.body.data.session.status).toBe('ABANDONED');
    expect(response.body.data.session.finalSummary).toBeNull();
  });

  it('refuses to answer a completed session', async () => {
    const client = await registerUser();
    await createProfile(client);
    const session = await startSession(client);
    const question = session.questions[0];

    await client.agent
      .post(`/api/v1/interviews/${session.id}/answer`)
      .set('x-csrf-token', client.csrfToken)
      .send({ questionId: question.id, answerText: 'A sufficiently detailed practice answer.' })
      .expect(201);
    await client.agent
      .post(`/api/v1/interviews/${session.id}/complete`)
      .set('x-csrf-token', client.csrfToken)
      .expect(200);

    await client.agent
      .post(`/api/v1/interviews/${session.id}/answer`)
      .set('x-csrf-token', client.csrfToken)
      .send({ questionId: session.questions[1].id, answerText: 'Too late for this answer.' })
      .expect(409);
  });

  it('refuses a report for a session still in progress', async () => {
    const client = await registerUser();
    await createProfile(client);
    const session = await startSession(client);

    await client.agent.get(`/api/v1/interviews/${session.id}/report`).expect(409);
  });

  it('tracks progress and the average score on the session', async () => {
    const client = await registerUser();
    await createProfile(client);
    const session = await startSession(client);

    await client.agent
      .post(`/api/v1/interviews/${session.id}/answer`)
      .set('x-csrf-token', client.csrfToken)
      .send({ questionId: session.questions[0].id, answerText: 'A detailed practice answer here.' })
      .expect(201);

    const refreshed = await client.agent.get(`/api/v1/interviews/${session.id}`).expect(200);
    expect(refreshed.body.data.session.completedQuestions).toBe(1);
    expect(refreshed.body.data.session.averageScore).not.toBeNull();
    expect(refreshed.body.data.session.questions[0].answered).toBe(true);
  });

  it('lists only the signed-in user sessions', async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    await createProfile(alice);
    await createProfile(bob);
    await startSession(alice);

    const bobList = await bob.agent.get('/api/v1/interviews').expect(200);
    expect(bobList.body.data.sessions).toHaveLength(0);
  });
});
