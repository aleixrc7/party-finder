import { zodResolver } from '@hookform/resolvers/zod';
import { LoginRequestSchema, ErrorCode } from '@party-finder/shared';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation } from 'react-router';
import { z } from 'zod';
import { controlProps, FormField } from '@/components/FormField';
import { ErrorMessage } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form-controls';
import { errorMessage, hasErrorCode } from '@/lib/api/errors';
import { routes } from '@/lib/routes';
import { AuthCard } from './AuthCard';
import { useCurrentUser, useLogin } from './queries';
import { ResendVerificationForm } from './ResendVerificationForm';

const LoginFormSchema = LoginRequestSchema.extend({
  username: z
    .string()
    .min(1, 'Introduce tu nombre de usuario')
    .pipe(LoginRequestSchema.shape.username),
  password: z.string().min(1, 'Introduce tu contraseña').pipe(LoginRequestSchema.shape.password),
});
type LoginFormValues = z.infer<typeof LoginFormSchema>;

export function LoginPage() {
  const { user } = useCurrentUser();
  const location = useLocation();
  const login = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(LoginFormSchema),
    defaultValues: { username: '', password: '' },
  });

  if (user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? routes.calendar} replace />;
  }

  const notVerified = hasErrorCode(login.error, ErrorCode.EMAIL_NOT_VERIFIED);

  return (
    <AuthCard title="Identificarse">
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => void handleSubmit((values) => login.mutate(values))(event)}
      >
        <FormField
          id="login-username"
          label="Nombre de usuario"
          error={errors.username?.message}
          required
        >
          <Input
            autoComplete="username"
            {...controlProps('login-username', errors.username?.message)}
            {...register('username')}
          />
        </FormField>
        <FormField id="login-password" label="Contraseña" error={errors.password?.message} required>
          <Input
            type="password"
            autoComplete="current-password"
            {...controlProps('login-password', errors.password?.message)}
            {...register('password')}
          />
        </FormField>
        {login.isError && <ErrorMessage>{errorMessage(login.error)}</ErrorMessage>}
        <Button type="submit" disabled={login.isPending}>
          {login.isPending ? 'Entrando…' : 'Iniciar sesión'}
        </Button>
      </form>
      {notVerified && (
        <section aria-label="Reenviar verificación" className="flex flex-col gap-3 border-t pt-4">
          <p className="text-sm text-muted-foreground">
            ¿No encuentras el correo? Indica tu dirección y te enviaremos uno nuevo.
          </p>
          <ResendVerificationForm />
        </section>
      )}
      <p className="text-sm text-muted-foreground">
        ¿No tienes cuenta?{' '}
        <Link
          className="font-medium text-primary underline-offset-4 hover:underline"
          to={routes.register}
        >
          Crear cuenta
        </Link>
      </p>
    </AuthCard>
  );
}
