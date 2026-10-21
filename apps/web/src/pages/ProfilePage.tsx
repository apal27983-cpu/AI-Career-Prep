import { Card, CardBody, CardHeader, SkeletonCard } from '../components/ui/Card';
import { ErrorState } from '../components/ui/States';
import { ProfileForm } from '../components/feature/ProfileForm';
import { useAsyncQuery } from '../hooks/useAsync';
import { profileApi } from '../services/endpoints';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export function ProfilePage() {
  const { user, markProfileComplete } = useAuth();
  const { notify } = useToast();
  const query = useAsyncQuery(() => profileApi.get().then((result) => result.data.profile), []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">My profile</h1>
        <p className="mt-1 text-sm text-slate-600">
          Keep this current - every analysis and interview question is generated from it.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Career profile"
          description={
            query.data
              ? `Last updated ${new Date(query.data.updatedAt).toLocaleString()}`
              : 'Not created yet'
          }
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
              save={async (input) => {
                const result = await profileApi.save(input);
                return result.data.profile;
              }}
              onSaved={(saved) => {
                query.setData(saved);
                markProfileComplete();
                notify('Profile saved.', 'success');
              }}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
