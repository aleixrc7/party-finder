import { zodResolver } from '@hookform/resolvers/zod';
import {
  ResendVerificationRequestSchema,
  type ResendVerificationRequest,
  type ResendVerificationRequestInput,
} from '@party-finder/shared';
import { useForm } from 'react-hook-form';
import { controlProps, FormField } from '@/components/FormField';
import { ErrorMessage } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form-controls';
import { errorMessage } from '@/lib/api/errors';
import { useResendVerification } from './queries';

interface ResendVerificationFormProps {
  defaultEmail?: string;
}

export function ResendVerificationForm({ defaultEmail = '' }: ResendVerificationFormProps) {
  const resend = useResendVerification();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResendVerificationRequestInput, unknown, ResendVerificationRequest>({
    resolver: zodResolver(ResendVerificationRequestSchema),
    defaultValues: { email: defaultEmail },
  });
  const emailError = errors.email?.message;

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => void handleSubmit((values) => resend.mutate(values))(event)}
    >
      <FormField id="resend-email" label="Correo electrónico" error={emailError} required>
        <Input
          type="email"
          autoComplete="email"
          {...controlProps('resend-email', emailError)}
          {...register('email')}
        />
      </FormField>
      {resend.isError && <ErrorMessage>{errorMessage(resend.error)}</ErrorMessage>}
      {resend.isSuccess && (
        <p role="status" className="text-sm text-success">
          {resend.data.message}
        </p>
      )}
      <Button type="submit" variant="outline" disabled={resend.isPending}>
        {resend.isPending ? 'Enviando…' : 'Reenviar correo de verificación'}
      </Button>
    </form>
  );
}
