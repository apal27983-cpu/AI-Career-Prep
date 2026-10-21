import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { LIMITS, registerSchema, type RegisterInput } from '@career-prep/shared';
import { AuthLayout } from '../components/layout/AuthLayout';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/Field';
import { ErrorState } from '../components/ui/States';
import { useAsyncAction } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { applyServerFieldErrors } from '../utils/formErrors';

export function RegisterPage() {
  const { register: registerUser } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  });

  const submit = useAsyncAction(async (values: RegisterInput) => registerUser(values), {
    onSuccess: () => {
      notify('Account created. Next, tell us about your target role.', 'success');
      navigate('/onboarding', { replace: true });
    },
    onError: (error) => applyServerFieldErrors(form, error),
  });

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Analyse your resume and practise interviews with structured feedback."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-700 hover:text-brand-800">
            Sign in
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
          label="Full name"
          autoComplete="name"
          required
          error={form.formState.errors.name?.message}
          {...form.register('name')}
        />
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
          autoComplete="new-password"
          required
          hint={`At least ${LIMITS.passwordMin} characters, with an uppercase letter and a number.`}
          error={form.formState.errors.password?.message}
          {...form.register('password')}
        />
        <TextField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          required
          error={form.formState.errors.confirmPassword?.message}
          {...form.register('confirmPassword')}
        />

        <Button type="submit" fullWidth loading={submit.loading} loadingLabel="Creating account...">
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
