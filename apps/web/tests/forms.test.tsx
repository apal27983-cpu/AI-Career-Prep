import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { registerSchema } from '@career-prep/shared';
import { renderWithProviders } from './helpers';
import { RegisterPage } from '../src/pages/RegisterPage';
import { LoginPage } from '../src/pages/LoginPage';
import { AuthProvider } from '../src/context/AuthContext';
import { authApi } from '../src/services/endpoints';
import { ApiError } from '../src/services/api';

function mockNoSession() {
  // AuthProvider calls /auth/me on mount; an unauthenticated 401 is normal.
  vi.spyOn(authApi, 'me').mockRejectedValue(
    new ApiError('UNAUTHENTICATED', 'Please sign in to continue.', 401),
  );
}

describe('registration form', () => {
  it('shows an inline error for every invalid field without calling the API', async () => {
    mockNoSession();
    const register = vi.spyOn(authApi, 'register');

    renderWithProviders(
      <AuthProvider>
        <RegisterPage />
      </AuthProvider>,
    );

    await userEvent.click(await screen.findByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/enter your full name/i)).toBeInTheDocument();
    expect(screen.getByText(/email is required/i)).toBeInTheDocument();
    expect(screen.getByText(/at least 10 characters/i)).toBeInTheDocument();
    // Nothing is sent until the client-side rules pass.
    expect(register).not.toHaveBeenCalled();
  });

  it('rejects a password that misses the composition rules', async () => {
    mockNoSession();
    renderWithProviders(
      <AuthProvider>
        <RegisterPage />
      </AuthProvider>,
    );

    await userEvent.type(await screen.findByLabelText(/full name/i), 'Jane Doe');
    await userEvent.type(screen.getByLabelText(/email address/i), 'jane@example.com');
    await userEvent.type(screen.getByLabelText(/^password\s*\*?$/i), 'alllowercase1');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'alllowercase1');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/uppercase letter/i)).toBeInTheDocument();
  });

  it('reports mismatched passwords on the confirmation field', async () => {
    mockNoSession();
    renderWithProviders(
      <AuthProvider>
        <RegisterPage />
      </AuthProvider>,
    );

    await userEvent.type(await screen.findByLabelText(/full name/i), 'Jane Doe');
    await userEvent.type(screen.getByLabelText(/email address/i), 'jane@example.com');
    await userEvent.type(screen.getByLabelText(/^password\s*\*?$/i), 'Str0ngPassword1');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'Str0ngPassword2');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
  });

  it('shows a loading label and blocks a second submit while in flight', async () => {
    mockNoSession();
    // A request that never settles, so the in-flight state can be inspected.
    const deferred: { resolve: (value: unknown) => void } = { resolve: () => {} };
    const register = vi.spyOn(authApi, 'register').mockImplementation(
      () =>
        new Promise((resolve) => {
          deferred.resolve = resolve as (value: unknown) => void;
        }) as never,
    );

    renderWithProviders(
      <AuthProvider>
        <RegisterPage />
      </AuthProvider>,
    );

    await userEvent.type(await screen.findByLabelText(/full name/i), 'Jane Doe');
    await userEvent.type(screen.getByLabelText(/email address/i), 'jane@example.com');
    await userEvent.type(screen.getByLabelText(/^password\s*\*?$/i), 'Str0ngPassword1');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'Str0ngPassword1');

    const submit = screen.getByRole('button', { name: /create account/i });
    await userEvent.click(submit);

    const busy = await screen.findByRole('button', { name: /creating account/i });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');

    await userEvent.click(busy);
    expect(register).toHaveBeenCalledTimes(1);

    deferred.resolve({
      data: {
        user: {
          id: 'u1',
          name: 'Jane Doe',
          email: 'jane@example.com',
          createdAt: new Date().toISOString(),
          hasProfile: false,
        },
        csrfToken: 'token',
      },
    });
  });

  it('surfaces a server error and keeps what the user typed', async () => {
    mockNoSession();
    vi.spyOn(authApi, 'register').mockRejectedValue(
      new ApiError('CONFLICT', 'An account already exists for that email address.', 409),
    );

    renderWithProviders(
      <AuthProvider>
        <RegisterPage />
      </AuthProvider>,
    );

    await userEvent.type(await screen.findByLabelText(/full name/i), 'Jane Doe');
    await userEvent.type(screen.getByLabelText(/email address/i), 'taken@example.com');
    await userEvent.type(screen.getByLabelText(/^password\s*\*?$/i), 'Str0ngPassword1');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'Str0ngPassword1');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/already exists for that email/i)).toBeInTheDocument();
    // The form is not cleared, so nothing has to be retyped.
    expect(screen.getByLabelText(/email address/i)).toHaveValue('taken@example.com');
  });

  it('maps server field errors onto the matching inputs', async () => {
    mockNoSession();
    vi.spyOn(authApi, 'register').mockRejectedValue(
      new ApiError('VALIDATION_ERROR', 'Please check the submitted information.', 400, {
        email: ['That email domain is not allowed'],
      }),
    );

    renderWithProviders(
      <AuthProvider>
        <RegisterPage />
      </AuthProvider>,
    );

    await userEvent.type(await screen.findByLabelText(/full name/i), 'Jane Doe');
    await userEvent.type(screen.getByLabelText(/email address/i), 'jane@blocked.test');
    await userEvent.type(screen.getByLabelText(/^password\s*\*?$/i), 'Str0ngPassword1');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'Str0ngPassword1');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/that email domain is not allowed/i)).toBeInTheDocument();
  });
});

describe('login form', () => {
  it('requires both fields before calling the API', async () => {
    mockNoSession();
    const login = vi.spyOn(authApi, 'login');

    renderWithProviders(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );

    await userEvent.click(await screen.findByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
    expect(screen.getByText(/enter your password/i)).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('shows the API message when the credentials are wrong', async () => {
    mockNoSession();
    vi.spyOn(authApi, 'login').mockRejectedValue(
      new ApiError('UNAUTHENTICATED', 'Those credentials did not match our records.', 401),
    );

    renderWithProviders(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );

    await userEvent.type(await screen.findByLabelText(/email address/i), 'jane@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'WrongPassword1');
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() =>
      expect(screen.getByText(/did not match our records/i)).toBeInTheDocument(),
    );
  });
});

describe('the shared schema is the same rule on both sides', () => {
  it('rejects the same input the API rejects', () => {
    const result = registerSchema.safeParse({
      name: 'A',
      email: 'nope',
      password: 'short',
      confirmPassword: 'other',
    });
    expect(result.success).toBe(false);
  });
});
