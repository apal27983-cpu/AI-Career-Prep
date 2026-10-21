import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import {
  RedirectIfAuthenticated,
  RequireAuth,
  RequireProfile,
} from './components/layout/Guards';
import { EmptyState } from './components/ui/States';
import { LinkButton } from './components/ui/Button';
import { Card } from './components/ui/Card';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProfilePage } from './pages/ProfilePage';
import { ResumeAnalyzerPage } from './pages/ResumeAnalyzerPage';
import { SkillGapPage } from './pages/SkillGapPage';
import { InterviewPracticePage } from './pages/InterviewPracticePage';
import { InterviewSessionPage } from './pages/InterviewSessionPage';
import { InterviewHistoryPage } from './pages/InterviewHistoryPage';
import { InterviewReportPage } from './pages/InterviewReportPage';
import { SettingsPage } from './pages/SettingsPage';

function NotFoundPage() {
  return (
    <div className="mx-auto max-w-lg p-6">
      <Card>
        <EmptyState
          title="Page not found"
          description="The page you were looking for does not exist."
          action={<LinkButton to="/dashboard">Back to dashboard</LinkButton>}
        />
      </Card>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<RedirectIfAuthenticated />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route element={<RequireAuth />}>
        {/* Onboarding sits inside the shell but outside the profile guard, so a
            user without a profile is not redirected in a loop. */}
        <Route element={<AppLayout />}>
          <Route path="/onboarding" element={<OnboardingPage />} />

          <Route element={<RequireProfile />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/resume" element={<ResumeAnalyzerPage />} />
            <Route path="/skill-gap" element={<SkillGapPage />} />
            <Route path="/interview" element={<InterviewPracticePage />} />
            <Route path="/interview/:sessionId" element={<InterviewSessionPage />} />
            <Route path="/history" element={<InterviewHistoryPage />} />
            <Route path="/history/:sessionId" element={<InterviewReportPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
