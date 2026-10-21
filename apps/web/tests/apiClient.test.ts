import { afterEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { CSRF_HEADER } from '@career-prep/shared';
import { ApiError, http, setCsrfToken, setSessionExpiredHandler } from '../src/services/api';
import { authApi, profileApi } from '../src/services/endpoints';

const originalAdapter = http.defaults.adapter;

/** Replaces the transport so the real interceptors still run. */
function stubTransport(
  handler: (config: InternalAxiosRequestConfig) => Partial<AxiosResponse>,
): { lastConfig: () => InternalAxiosRequestConfig | null } {
  let captured: InternalAxiosRequestConfig | null = null;

  const adapter: AxiosAdapter = async (config) => {
    captured = config as InternalAxiosRequestConfig;
    const result = handler(config as InternalAxiosRequestConfig);
    const response = {
      status: 200,
      statusText: 'OK',
      headers: {},
      config: config as InternalAxiosRequestConfig,
      data: undefined,
      ...result,
    } as AxiosResponse;

    // A custom adapter owns status handling, so it must reject like the real one.
    if (response.status >= 400) {
      throw new AxiosError(
        `Request failed with status code ${response.status}`,
        String(response.status),
        config as InternalAxiosRequestConfig,
        {},
        response,
      );
    }
    return response;
  };

  http.defaults.adapter = adapter;
  return { lastConfig: () => captured };
}

afterEach(() => {
  http.defaults.adapter = originalAdapter;
  setCsrfToken(null);
  setSessionExpiredHandler(null);
});

describe('API client', () => {
  it('sends credentials so the session cookie travels with every request', () => {
    expect(http.defaults.withCredentials).toBe(true);
  });

  it('points only at our own backend', () => {
    expect(http.defaults.baseURL).toBe('/api/v1');
  });

  it('attaches the CSRF header to state-changing requests', async () => {
    setCsrfToken('csrf-token-value');
    const transport = stubTransport(() => ({
      data: { success: true, data: { profile: null } },
    }));

    await profileApi.save({
      fullName: 'Jane Doe',
      currentRole: 'Engineer',
      targetRole: 'Backend Engineer',
      experienceLevel: 'INTERMEDIATE',
      yearsOfExperience: 4,
      education: 'BSc',
      skills: ['TypeScript'],
      learningGoals: [],
      preferredInterviewMode: 'TECHNICAL',
      targetIndustry: '',
      careerObjective: '',
      jobDescription: '',
    });

    expect(transport.lastConfig()?.headers.get(CSRF_HEADER)).toBe('csrf-token-value');
  });

  it('does not attach the CSRF header to reads', async () => {
    setCsrfToken('csrf-token-value');
    const transport = stubTransport(() => ({
      data: { success: true, data: { profile: null } },
    }));

    await profileApi.get();
    expect(transport.lastConfig()?.headers.get(CSRF_HEADER)).toBeFalsy();
  });

  it('normalises an error envelope into an ApiError with field details', async () => {
    stubTransport(() => ({
      status: 400,
      data: {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Please check the submitted information.',
          details: { email: ['Enter a valid email address'] },
        },
      },
    }));

    await expect(authApi.login({ email: 'x@example.com', password: 'y' })).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ApiError &&
        error.code === 'VALIDATION_ERROR' &&
        error.details?.email?.[0] === 'Enter a valid email address',
    );
  });

  it('notifies the app when the session has expired', async () => {
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);

    stubTransport(() => ({
      status: 401,
      data: {
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'Your session has expired.' },
      },
    }));

    await expect(authApi.me()).rejects.toBeInstanceOf(ApiError);
    expect(onExpired).toHaveBeenCalledOnce();
  });

  it('turns a transport failure into a retryable network error', async () => {
    http.defaults.adapter = async () => {
      throw Object.assign(new Error('Network Error'), { isAxiosError: true, config: {} });
    };

    const error = await authApi.me().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('NETWORK_ERROR');
    expect((error as ApiError).isRetryable).toBe(true);
  });

  it('classifies which failures are worth retrying', () => {
    expect(new ApiError('AI_UNAVAILABLE', 'x', 503).isRetryable).toBe(true);
    expect(new ApiError('TIMEOUT', 'x', 504).isRetryable).toBe(true);
    expect(new ApiError('VALIDATION_ERROR', 'x', 400).isRetryable).toBe(false);
    expect(new ApiError('NOT_FOUND', 'x', 404).isRetryable).toBe(false);
    expect(new ApiError('UNAUTHENTICATED', 'x', 401).isSessionExpired).toBe(true);
  });

  it('rejects a success envelope that reports failure', async () => {
    stubTransport(() => ({
      status: 200,
      data: { success: false, error: { code: 'FORBIDDEN', message: 'Not allowed.' } },
    }));

    await expect(profileApi.get()).rejects.toSatisfy(
      (error: unknown) => error instanceof ApiError && error.code === 'FORBIDDEN',
    );
  });
});
