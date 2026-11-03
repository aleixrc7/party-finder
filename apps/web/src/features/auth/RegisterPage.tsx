import { zodResolver } from '@hookform/resolvers/zod';
import {
  ErrorCode,
  RegisterRequestSchema,
  type RegisterRequest,
  type RegisterRequestInput,
} from '@party-finder/shared';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate } from 'react-router';
import { controlProps, FormField } from '@/components/FormField';
import { ErrorMessage } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form-controls';
import { errorMessage, fieldErrors, hasErrorCode } from '@/lib/api/errors';
import { routes } from '@/lib/routes';
import { AuthCard } from './AuthCard';
import { useCurrentUser, useRegister } from './queries';
import { ResendVerificationForm } from './ResendVerificationForm';
import { TurnstileWidget } from './TurnstileWidget';

const REGISTER_FIELDS = ['username', 'email', 'password'] as const;
type RegisterField = (typeof REGISTER_FIELDS)[number];

function isRegisterField(field: string): field is RegisterField {
  return (REGISTER_FIELDS as readonly string[]).includes(field);
}

function CheckEmailScreen({ message, email }: { message: string; email: string }) {
  return (
    <AuthCard title="Revisa tu correo">
      <p role="status" className="text-sm">
        {message}
      </p>
      <p className="text-sm text-muted-foreground">
        Abre el enlace del correo para activar tu cuenta. Caduca en 24 horas. ¿No te ha llegado?
        Puedes pedir otro.
      </p>
      <ResendVerificationForm defaultEmail={email} />
      <Link
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        to={routes.login}
      >
        Ir a Identificarse
      </Link>
    </AuthCard>
  );
}

export function RegisterPage() {
  const { user } = useCurrentUser();
  const registerUser = useRegister();
  const [captchaAttempt, setCaptchaAttempt] = useState(0);
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    getValues,
    formState: { errors },
  } = useForm<RegisterRequestInput, unknown, RegisterRequest>({
    resolver: zodResolver(RegisterRequestSchema),
    defaultValues: { username: '', email: '', password: '', captchaToken: '' },
  });

  const handleCaptchaToken = useCallback(
    (token: string) => setValue('captchaToken', token, { shouldValidate: token !== '' }),
    [setValue],
  );

  if (user) {
    return <Navigate to={routes.calendar} replace />;
  }
  if (registerUser.isSuccess) {
    return (
      <CheckEmailScreen
        message={registerUser.data.message}
        email={RegisterRequestSchema.shape.email.parse(getValues('email'))}
      />
    );
  }

  const onSubmit = (values: RegisterRequest) =>
    registerUser.mutate(values, {
      onError: (error) => {
        setValue('captchaToken', '');
        setCaptchaAttempt((attempt) => attempt + 1);
        if (hasErrorCode(error, ErrorCode.USERNAME_TAKEN)) {
          setError('username', { message: errorMessage(error) });
        }
        for (const { field, message } of fieldErrors(error)) {
          if (isRegisterField(field)) {
            setError(field, { message });
          }
        }
      },
    });

  const showGeneralError =
    registerUser.isError && !hasErrorCode(registerUser.error, ErrorCode.USERNAME_TAKEN);

  return (
    <AuthCard title="Crear cuenta">
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      >
        <FormField
          id="register-username"
          label="Nombre de usuario"
          error={errors.username?.message}
          required
        >
          <Input
            autoComplete="username"
            {...controlProps('register-username', errors.username?.message)}
            {...register('username')}
          />
        </FormField>
        <FormField
          id="register-email"
          label="Correo electrónico"
          error={errors.email?.message}
          required
        >
          <Input
            type="email"
            autoComplete="email"
            {...controlProps('register-email', errors.email?.message)}
            {...register('email')}
          />
        </FormField>
        <FormField
          id="register-password"
          label="Contraseña"
          error={errors.password?.message}
          required
        >
          <Input
            type="password"
            autoComplete="new-password"
            {...controlProps('register-password', errors.password?.message)}
            {...register('password')}
          />
        </FormField>
        <div className="flex flex-col gap-1.5">
          <TurnstileWidget key={captchaAttempt} onTokenChange={handleCaptchaToken} />
          {errors.captchaToken?.message && (
            <p className="text-xs text-destructive">{errors.captchaToken.message}</p>
          )}
        </div>
        {showGeneralError && <ErrorMessage>{errorMessage(registerUser.error)}</ErrorMessage>}
        <Button type="submit" disabled={registerUser.isPending}>
          {registerUser.isPending ? 'Creando cuenta…' : 'Crear cuenta'}
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        ¿Ya tienes cuenta?{' '}
        <Link
          className="font-medium text-primary underline-offset-4 hover:underline"
          to={routes.login}
        >
          Identificarse
        </Link>
      </p>
    </AuthCard>
  );
}
