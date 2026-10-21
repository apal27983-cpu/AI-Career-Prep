import supertest from 'supertest';
import type { Express } from 'express';
import { CSRF_COOKIE } from '@career-prep/shared';
import { createApp } from '../../src/app.js';
import { databaseReachable, prisma } from '../../src/config/prisma.js';

let cachedApp: Express | null = null;

export function app(): Express {
  cachedApp ??= createApp();
  return cachedApp;
}

/**
 * Integration tests need a real PostgreSQL database. Rather than fail with a
 * misleading error when one is not configured, the suite skips itself and says
 * so, so `npm test` is still meaningful on a fresh checkout.
 */
let reachable: boolean | null = null;

export async function hasDatabase(): Promise<boolean> {
  reachable ??= await databaseReachable();
  return reachable;
}

/** Wipes every table between tests. Order follows the foreign keys. */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "interview_answers", "interview_questions", "interview_sessions", ' +
      '"skill_gap_analyses", "resumes", "candidate_profiles", "auth_sessions", ' +
      '"ai_usage_logs", "users" RESTART IDENTITY CASCADE',
  );
}

export interface TestClient {
  agent: supertest.Agent;
  csrfToken: string;
  userId: string;
  email: string;
}

const STRONG_PASSWORD = 'Str0ngPassword1';

function readCsrf(headers: Record<string, unknown>): string {
  const raw = headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  const match = cookies.find((cookie) => cookie.startsWith(`${CSRF_COOKIE}=`));
  if (!match) throw new Error('No CSRF cookie was issued');
  return decodeURIComponent(match.split(';')[0]!.split('=')[1]!);
}

/** Registers a user and returns a cookie-carrying agent for them. */
export async function registerUser(
  overrides: { name?: string; email?: string; password?: string } = {},
): Promise<TestClient> {
  const email = overrides.email ?? `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = overrides.password ?? STRONG_PASSWORD;
  const agent = supertest.agent(app());

  const response = await agent
    .post('/api/v1/auth/register')
    .send({
      name: overrides.name ?? 'Test Candidate',
      email,
      password,
      confirmPassword: password,
    })
    .expect(201);

  return {
    agent,
    csrfToken: readCsrf(response.headers as Record<string, unknown>),
    userId: response.body.data.user.id as string,
    email,
  };
}

/** Saves a complete, valid career profile for the signed-in user. */
export async function createProfile(
  client: TestClient,
  overrides: Record<string, unknown> = {},
): Promise<void> {
  await client.agent
    .put('/api/v1/profile')
    .set('x-csrf-token', client.csrfToken)
    .send({
      fullName: 'Test Candidate',
      currentRole: 'Backend Engineer',
      targetRole: 'Senior Backend Engineer',
      experienceLevel: 'INTERMEDIATE',
      yearsOfExperience: 4,
      education: 'BSc Computer Science',
      skills: ['TypeScript', 'PostgreSQL', 'Docker'],
      learningGoals: ['System design'],
      preferredInterviewMode: 'TECHNICAL',
      targetIndustry: 'Fintech',
      careerObjective: 'Lead backend work on payment systems.',
      jobDescription: '',
      ...overrides,
    })
    .expect(200);
}

export { STRONG_PASSWORD };
