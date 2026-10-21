import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import { app, hasDatabase, registerUser, resetDatabase, STRONG_PASSWORD } from '../helpers/server.js';
import { disconnectPrisma, prisma } from '../../src/config/prisma.js';

const dbAvailable = await hasDatabase();

describe.skipIf(!dbAvailable)('authentication', () => {
  beforeEach(resetDatabase);
  afterAll(disconnectPrisma);

  it('registers a user, issues a session and returns no secrets', async () => {
    const response = await supertest(app())
      .post('/api/v1/auth/register')
      .send({
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: STRONG_PASSWORD,
        confirmPassword: STRONG_PASSWORD,
      })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe('jane@example.com');
    expect(response.body.data.user.hasProfile).toBe(false);

    const serialised = JSON.stringify(response.body);
    expect(serialised).not.toMatch(/passwordHash/);
    expect(serialised).not.toMatch(/\$argon2/);

    const cookies = response.headers['set-cookie'] as unknown as string[];
    const session = cookies.find((cookie) => cookie.startsWith('career_prep_session='));
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=Lax/i);
  });

  it('stores an Argon2id hash, never the password', async () => {
    await registerUser({ email: 'hash@example.com' });
    const user = await prisma.user.findUnique({ where: { email: 'hash@example.com' } });

    expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user?.passwordHash).not.toContain(STRONG_PASSWORD);
  });

  it('stores only a hash of the session token', async () => {
    await registerUser({ email: 'session@example.com' });
    const session = await prisma.authSession.findFirst();

    // A 64-character hex digest, not the base64url cookie value.
    expect(session?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects a weak password with field-level messages', async () => {
    const response = await supertest(app())
      .post('/api/v1/auth/register')
      .send({ name: 'Jane', email: 'weak@example.com', password: 'short', confirmPassword: 'short' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.password.length).toBeGreaterThan(0);
  });

  it('rejects mismatched password confirmation', async () => {
    const response = await supertest(app())
      .post('/api/v1/auth/register')
      .send({
        name: 'Jane',
        email: 'mismatch@example.com',
        password: STRONG_PASSWORD,
        confirmPassword: `${STRONG_PASSWORD}x`,
      })
      .expect(400);

    expect(response.body.error.details.confirmPassword).toContain('Passwords do not match');
  });

  it('refuses a duplicate email', async () => {
    await registerUser({ email: 'dupe@example.com' });

    const response = await supertest(app())
      .post('/api/v1/auth/register')
      .send({
        name: 'Other',
        email: 'dupe@example.com',
        password: STRONG_PASSWORD,
        confirmPassword: STRONG_PASSWORD,
      })
      .expect(409);

    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('treats the email as case-insensitive', async () => {
    await registerUser({ email: 'case@example.com' });

    await supertest(app())
      .post('/api/v1/auth/login')
      .send({ email: 'CASE@EXAMPLE.COM', password: STRONG_PASSWORD })
      .expect(200);
  });

  it('logs in with the right password and out again', async () => {
    const client = await registerUser({ email: 'login@example.com' });

    const agent = supertest.agent(app());
    const login = await agent
      .post('/api/v1/auth/login')
      .send({ email: 'login@example.com', password: STRONG_PASSWORD })
      .expect(200);

    const csrf = (login.headers['set-cookie'] as unknown as string[])
      .find((cookie) => cookie.startsWith('career_prep_csrf='))!
      .split(';')[0]!
      .split('=')[1]!;

    await agent.get('/api/v1/auth/me').expect(200);
    await agent.post('/api/v1/auth/logout').set('x-csrf-token', decodeURIComponent(csrf)).expect(200);
    await agent.get('/api/v1/auth/me').expect(401);

    // The original session row is gone, not just the cookie.
    const remaining = await prisma.authSession.count({ where: { userId: client.userId } });
    expect(remaining).toBeLessThanOrEqual(1);
  });

  it('gives the same message for a wrong password and an unknown email', async () => {
    await registerUser({ email: 'known@example.com' });

    const wrongPassword = await supertest(app())
      .post('/api/v1/auth/login')
      .send({ email: 'known@example.com', password: 'WrongPassword1' })
      .expect(401);

    const unknownEmail = await supertest(app())
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'WrongPassword1' })
      .expect(401);

    // Identical responses, so the endpoint does not enumerate accounts.
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
  });

  it('changes the password and signs other devices out', async () => {
    const client = await registerUser({ email: 'rotate@example.com' });

    // A second device for the same account.
    const other = supertest.agent(app());
    await other
      .post('/api/v1/auth/login')
      .send({ email: 'rotate@example.com', password: STRONG_PASSWORD })
      .expect(200);
    await other.get('/api/v1/auth/me').expect(200);

    await client.agent
      .put('/api/v1/auth/password')
      .set('x-csrf-token', client.csrfToken)
      .send({
        currentPassword: STRONG_PASSWORD,
        newPassword: 'An0therStrongPass',
        confirmNewPassword: 'An0therStrongPass',
      })
      .expect(200);

    await other.get('/api/v1/auth/me').expect(401);
    await supertest(app())
      .post('/api/v1/auth/login')
      .send({ email: 'rotate@example.com', password: 'An0therStrongPass' })
      .expect(200);
  });

  it('refuses a password change with the wrong current password', async () => {
    const client = await registerUser({ email: 'wrongcurrent@example.com' });

    await client.agent
      .put('/api/v1/auth/password')
      .set('x-csrf-token', client.csrfToken)
      .send({
        currentPassword: 'NotMyPassword1',
        newPassword: 'An0therStrongPass',
        confirmNewPassword: 'An0therStrongPass',
      })
      .expect(401);
  });

  it('deletes the account and everything that cascades from it', async () => {
    const client = await registerUser({ email: 'gone@example.com' });

    await client.agent
      .delete('/api/v1/auth/account')
      .set('x-csrf-token', client.csrfToken)
      .expect(200);

    expect(await prisma.user.count({ where: { id: client.userId } })).toBe(0);
    expect(await prisma.authSession.count({ where: { userId: client.userId } })).toBe(0);
    await client.agent.get('/api/v1/auth/me').expect(401);
  });

  it('reports health without leaking configuration', async () => {
    const response = await supertest(app()).get('/health').expect(200);
    expect(response.body.data.status).toBe('ok');
    expect(JSON.stringify(response.body)).not.toMatch(/postgresql:\/\//);
  });
});

describe.skipIf(dbAvailable)('authentication (skipped)', () => {
  it('needs a database', () => {
    console.warn(
      'Integration tests were skipped: no database at DATABASE_URL/TEST_DATABASE_URL. ' +
        'See the README section "Running the tests".',
    );
    expect(true).toBe(true);
  });
});
