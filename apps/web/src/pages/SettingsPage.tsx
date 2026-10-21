import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, KeyRound, LogOut, Trash2 } from 'lucide-react';
import { changePasswordSchema, LIMITS, type ChangePasswordInput } from '@career-prep/shared';
import { Card, CardBody, CardHeader, SkeletonCard } from '../components/ui/Card';
import { ErrorState } from '../components/ui/States';
import { Button, LinkButton } from '../components/ui/Button';
import { TextField } from '../components/ui/Field';
import { useAsyncAction, useAsyncQuery } from '../hooks/useAsync';
import { authApi, resumeApi } from '../services/endpoints';
import { setCsrfToken } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { applyServerFieldErrors } from '../utils/formErrors';

const DELETE_PHRASE = 'DELETE MY ACCOUNT';

export function SettingsPage() {
  const { user, logout } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [confirmPhrase, setConfirmPhrase] = useState('');

  const resumes = useAsyncQuery(
    () => resumeApi.list().then((result) => result.data.resumes),
    [],
  );

  const passwordForm = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmNewPassword: '' },
  });

  const changePassword = useAsyncAction(
    async (values: ChangePasswordInput) => {
      const result = await authApi.changePassword(values);
      return result.data;
    },
    {
      onSuccess: (data) => {
        // The server rotated every session; keep this tab working with the new token.
        setCsrfToken(data.csrfToken);
        passwordForm.reset();
        notify('Password updated. Other devices have been signed out.', 'success');
      },
      onError: (error) => applyServerFieldErrors(passwordForm, error),
    },
  );

  const deleteResumes = useAsyncAction(
    async () => {
      const list = resumes.data ?? [];
      for (const resume of list) {
        await resumeApi.remove(resume.id);
      }
      return list.length;
    },
    {
      onSuccess: (count) => {
        notify(
          count === 0
            ? 'There were no resumes to delete.'
            : `Deleted ${count} resume${count === 1 ? '' : 's'} and the stored files.`,
          'success',
        );
        void resumes.reload();
      },
    },
  );

  const deleteAccount = useAsyncAction(async () => authApi.deleteAccount(), {
    onSuccess: async () => {
      notify('Your account and all associated data have been deleted.', 'success');
      await logout();
      navigate('/register', { replace: true });
    },
  });

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage your sign-in details and the data stored about you.
        </p>
      </div>

      <Card>
        <CardHeader title="Account" />
        <CardBody className="space-y-2 text-sm">
          <p className="text-slate-700">
            <span className="font-medium text-slate-900">Name: </span>
            {user?.name}
          </p>
          <p className="text-slate-700">
            <span className="font-medium text-slate-900">Email: </span>
            {user?.email}
          </p>
          <p className="text-slate-500">
            Your career profile lives on the profile page.{' '}
            <LinkButton to="/profile" variant="ghost" size="sm" className="px-1">
              Edit profile
            </LinkButton>
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Change password"
          description="Changing it signs you out everywhere else."
        />
        <CardBody>
          <form
            noValidate
            className="max-w-md space-y-4"
            onSubmit={passwordForm.handleSubmit((values) => void changePassword.run(values))}
          >
            {changePassword.error ? <ErrorState error={changePassword.error} /> : null}

            <TextField
              label="Current password"
              type="password"
              autoComplete="current-password"
              required
              error={passwordForm.formState.errors.currentPassword?.message}
              {...passwordForm.register('currentPassword')}
            />
            <TextField
              label="New password"
              type="password"
              autoComplete="new-password"
              required
              hint={`At least ${LIMITS.passwordMin} characters, with an uppercase letter and a number.`}
              error={passwordForm.formState.errors.newPassword?.message}
              {...passwordForm.register('newPassword')}
            />
            <TextField
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              required
              error={passwordForm.formState.errors.confirmNewPassword?.message}
              {...passwordForm.register('confirmNewPassword')}
            />

            <Button
              type="submit"
              loading={changePassword.loading}
              loadingLabel="Updating password..."
              icon={<KeyRound className="h-4 w-4" />}
            >
              Update password
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Resume data"
          description="Deleting a resume removes its stored file and extracted text."
        />
        <CardBody className="space-y-3">
          {resumes.loading ? (
            <SkeletonCard lines={2} className="border-0 shadow-none" />
          ) : resumes.error ? (
            <ErrorState error={resumes.error} onRetry={() => void resumes.reload()} />
          ) : (
            <p className="text-sm text-slate-700">
              You have {resumes.data?.length ?? 0} resume
              {(resumes.data?.length ?? 0) === 1 ? '' : 's'} stored.
            </p>
          )}

          {deleteResumes.error ? <ErrorState error={deleteResumes.error} /> : null}

          <Button
            variant="secondary"
            onClick={() => void deleteResumes.run()}
            loading={deleteResumes.loading}
            loadingLabel="Deleting resumes..."
            disabled={(resumes.data?.length ?? 0) === 0}
            icon={<Trash2 className="h-4 w-4" />}
          >
            Delete all resumes
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Sessions" />
        <CardBody>
          <Button
            variant="secondary"
            onClick={() => void handleLogout()}
            icon={<LogOut className="h-4 w-4" />}
          >
            Sign out of this device
          </Button>
        </CardBody>
      </Card>

      <Card className="border-red-200">
        <CardHeader
          title="Delete your account"
          description="This removes your profile, resumes, reports and interviews. It cannot be undone."
        />
        <CardBody className="space-y-3">
          <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            Everything is deleted immediately, including uploaded files. There is no recovery.
          </p>

          {deleteAccount.error ? <ErrorState error={deleteAccount.error} /> : null}

          <TextField
            label={`Type "${DELETE_PHRASE}" to confirm`}
            name="deleteConfirmation"
            value={confirmPhrase}
            onChange={(event) => setConfirmPhrase(event.target.value)}
            autoComplete="off"
          />

          <Button
            variant="danger"
            onClick={() => void deleteAccount.run()}
            loading={deleteAccount.loading}
            loadingLabel="Deleting account..."
            disabled={confirmPhrase.trim() !== DELETE_PHRASE}
            icon={<Trash2 className="h-4 w-4" />}
          >
            Delete my account
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
