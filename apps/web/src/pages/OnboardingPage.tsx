import { useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { Card, CardBody, CardHeader, SkeletonCard } from '../components/ui/Card';
import { ErrorState } from '../components/ui/States';
import { ProfileForm } from '../components/feature/ProfileForm';
import { useAsyncQuery } from '../hooks/useAsync';
import { profileApi } from '../services/endpoints';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const STEPS = ['Create your account', 'Complete your career profile', 'Analyse and practise'];

export function OnboardingPage() {
  const { user, markProfileComplete } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const query = useAsyncQuery(() => profileApi.get().then((result) => result.data.profile), []);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Set up your career profile</h1>
        <p className="mt-1 text-sm text-slate-600">
          This is what your skill gap report and interview questions are built from. You can change
          any of it later.
        </p>
      </div>

      <ol className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {STEPS.map((step, index) => {
          const done = index === 0;
          const active = index === 1;
          return (
            <li key={step} className="flex items-center gap-2">
              {done ? (
                <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-emerald-600" />
              ) : (
                <span
                  aria-hidden="true"
                  className={
                    active
                      ? 'flex h-4 w-4 items-center justify-center rounded-full border border-brand-600 text-[10px] font-semibold text-brand-700'
                      : 'flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] text-slate-400'
                  }
                >
                  {index + 1}
                </span>
              )}
              <span className={active ? 'font-medium text-slate-900' : 'text-slate-500'}>
                {step}
              </span>
            </li>
          );
        })}
      </ol>

      <Card>
        <CardHeader
          title="Career profile"
          description="Fields marked with an asterisk are required."
        />
        <CardBody>
          {query.loading ? (
            <SkeletonCard lines={6} className="border-0 shadow-none" />
          ) : query.error ? (
            <ErrorState error={query.error} onRetry={() => void query.reload()} />
          ) : (
            <ProfileForm
              profile={query.data}
              fallbackName={user?.name ?? ''}
              submitLabel="Save and continue"
              loadingLabel="Saving profile..."
              save={async (input) => {
                const result = await profileApi.save(input);
                return result.data.profile;
              }}
              onSaved={() => {
                markProfileComplete();
                notify('Profile saved. Upload a resume next.', 'success');
                navigate('/resume', { replace: true });
              }}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
