import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';
import type { AuthenticatedUser } from '@career-prep/shared';
import { App } from '../src/App';
import { AuthProvider } from '../src/context/AuthContext';
import { ToastProvider } from '../src/context/ToastContext';
import { ApiError } from '../src/services/api';
import { authApi, dashboardApi, interviewApi, profileApi } from '../src/services/endpoints';

function renderApp(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

const user = (overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
  id: 'u1',
  name: 'Jane Doe',
  email: 'jane@example.com',
  createdAt: new Date().toISOString(),
  hasProfile: true,
  ...overrides,
});

function signedIn(overrides: Partial<AuthenticatedUser> = {}) {
  vi.spyOn(authApi, 'me').mockResolvedValue({
    data: { user: user(overrides), csrfToken: 'token' },
  } as never);
}

function signedOut() {
  vi.spyOn(authApi, 'me').mockRejectedValue(
    new ApiError('UNAUTHENTICATED', 'Please sign in to continue.', 401),
  );
}

describe('protected routes', () => {
  it('sends an unauthenticated visitor to the sign-in screen', async () => {
    signedOut();
    renderApp('/dashboard');

    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument();
  });

  it.each(['/profile', '/resume', '/skill-gap', '/interview', '/history', '/settings'])(
    'guards %s',
    async (route) => {
      signedOut();
      renderApp(route);
      expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    },
  );

  it('sends a signed-in user without a profile through onboarding', async () => {
    signedIn({ hasProfile: false });
    vi.spyOn(profileApi, 'get').mockResolvedValue({ data: { profile: null } } as never);

    renderApp('/dashboard');

    expect(
      await screen.findByRole('heading', { name: /set up your career profile/i }),
    ).toBeInTheDocument();
  });

  it('keeps a signed-in user away from the sign-in screen', async () => {
    signedIn();
    vi.spyOn(dashboardApi, 'get').mockResolvedValue({
      data: {
        targetRole: 'Backend Engineer',
        hasProfile: true,
        resumeCount: 0,
        latestResume: null,
        latestReadinessScore: null,
        latestAnalysisId: null,
        analysisCount: 0,
        interviewsCompleted: 0,
        interviewsInProgress: 0,
        answersEvaluated: 0,
        averageInterviewScore: null,
        scoreByMode: [],
        scoreTrend: [],
        recentSessions: [],
        recommendedNextSteps: ['Upload a resume.'],
      },
    } as never);

    renderApp('/login');

    expect(await screen.findByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
  });

  it('explains an expired session instead of showing a blank page', async () => {
    // The redirect itself comes from the API client interceptor, covered in
    // apiClient.test.ts. Here the page must degrade rather than crash.
    signedIn();
    vi.spyOn(dashboardApi, 'get').mockRejectedValue(
      new ApiError('UNAUTHENTICATED', 'Your session has expired. Please sign in again.', 401),
    );

    renderApp('/dashboard');

    await waitFor(() =>
      expect(screen.getByText(/your session has expired/i)).toBeInTheDocument(),
    );
  });

  it('shows a not-found page for an unknown route', async () => {
    signedOut();
    renderApp('/nope');
    expect(await screen.findByRole('heading', { name: /page not found/i })).toBeInTheDocument();
  });
});

describe('dashboard', () => {
  it('shows a helpful empty state for a new user and no invented numbers', async () => {
    signedIn();
    vi.spyOn(dashboardApi, 'get').mockResolvedValue({
      data: {
        targetRole: 'Backend Engineer',
        hasProfile: true,
        resumeCount: 0,
        latestResume: null,
        latestReadinessScore: null,
        latestAnalysisId: null,
        analysisCount: 0,
        interviewsCompleted: 0,
        interviewsInProgress: 0,
        answersEvaluated: 0,
        averageInterviewScore: null,
        scoreByMode: [],
        scoreTrend: [],
        recentSessions: [],
        recommendedNextSteps: ['Upload a PDF or DOCX resume.'],
      },
    } as never);

    renderApp('/dashboard');

    expect(await screen.findByText(/nothing to show yet/i)).toBeInTheDocument();
    // Missing metrics render as "--", never as a plausible-looking number.
    expect(screen.getAllByText('--').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/upload a pdf or docx resume/i)).toBeInTheDocument();
  });

  it('offers a retry when the dashboard request fails', async () => {
    signedIn();
    const get = vi
      .spyOn(dashboardApi, 'get')
      .mockRejectedValue(new ApiError('INTERNAL_ERROR', 'Something went wrong.', 500));

    renderApp('/dashboard');

    await userEvent.click(await screen.findByRole('button', { name: /try again/i }));
    expect(get).toHaveBeenCalledTimes(2);
  });
});

describe('interview mode selection', () => {
  it('offers all four modes and starts the chosen one', async () => {
    signedIn();
    vi.spyOn(profileApi, 'get').mockResolvedValue({
      data: {
        profile: {
          id: 'p1',
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
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    } as never);

    const create = vi.spyOn(interviewApi, 'create').mockResolvedValue({
      data: { session: { id: 's1' } },
    } as never);

    renderApp('/interview');

    for (const label of [
      'Technical Interview',
      'Non-Technical Interview',
      'Aptitude Interview',
      'HR Interview',
    ]) {
      expect(await screen.findByText(label)).toBeInTheDocument();
    }

    await userEvent.click(screen.getByText('Aptitude Interview'));
    await userEvent.selectOptions(screen.getByLabelText(/number of questions/i), '10');
    await userEvent.click(await screen.findByRole('button', { name: /start aptitude interview/i }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'APTITUDE', totalQuestions: 10, difficulty: 'MEDIUM' }),
      ),
    );
  });
});
