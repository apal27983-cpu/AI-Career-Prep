import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { loginSchema, type LoginInput } from '@career-prep/shared';
import { AuthLayout } from '../components/layout/AuthLayout';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/Field';
import { ErrorState } from '../components/ui/States';
import { useAsyncAction } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { applyServerFieldErrors } from '../utils/formErrors';

export function LoginPage() {
  const { login } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const submit = useAsyncAction(async (values: LoginInput) => login(values), {
    onSuccess: (user) => {
      notify(`Welcome back, ${user.name}.`, 'success');
      navigate(user.hasProfile ? (from ?? '/dashboard') : '/onboarding', { replace: true });
    },
    onError: (error) => applyServerFieldErrors(form, error),
  });

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Pick up where you left off."
      footer={
        <>
          No account yet?{' '}
          <Link to="/register" className="font-medium text-brand-700 hover:text-brand-800">
            Create one
          </Link>
        </>
      }
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={form.handleSubmit((values) => void submit.run(values))}
      >
        {submit.error ? <ErrorState error={submit.error} /> : null}

        <TextField
          label="Email address"
          type="email"
          autoComplete="email"
          required
          error={form.formState.errors.email?.message}
          {...form.register('email')}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          error={form.formState.errors.password?.message}
          {...form.register('password')}
        />

        <Button type="submit" fullWidth loading={submit.loading} loadingLabel="Signing in...">
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
