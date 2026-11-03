import { AUTH_MESSAGES } from '@party-finder/shared';
import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ErrorMessage, ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api/errors';
import { routes } from '@/lib/routes';
import { AuthCard } from './AuthCard';
import { isTokenRejected, useVerifyEmail } from './queries';
import { ResendVerificationForm } from './ResendVerificationForm';

const AFTER_VERIFY_REFERRER_POLICY = 'strict-origin-when-cross-origin';

function useNoReferrerWhileMounted() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.append(meta);
    return () => {
      meta.content = AFTER_VERIFY_REFERRER_POLICY;
    };
  }, []);
}

function ExpiredLink() {
  return (
    <AuthCard title="Enlace caducado">
      <ErrorMessage>{AUTH_MESSAGES.INVALID_OR_EXPIRED_TOKEN}</ErrorMessage>
      <p className="text-sm text-muted-foreground">
        Indica tu correo electrónico y te enviaremos un enlace nuevo.
      </p>
      <ResendVerificationForm />
    </AuthCard>
  );
}

export function VerifyEmailPage() {
  useNoReferrerWhileMounted();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const verification = useVerifyEmail(token);

  if (token === null || isTokenRejected(verification.error)) {
    return <ExpiredLink />;
  }
  if (verification.isError) {
    return (
      <AuthCard title="Verificar correo">
        <ErrorState
          message={errorMessage(verification.error)}
          onRetry={() => void verification.refetch()}
        />
      </AuthCard>
    );
  }
  if (verification.isSuccess) {
    return (
      <AuthCard title="Cuenta verificada">
        <p role="status" className="text-sm">
          {verification.data.message}
        </p>
        <Button asChild>
          <Link to={routes.login}>Identificarse</Link>
        </Button>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Verificar correo">
      <LoadingState label="Verificando tu cuenta…" />
    </AuthCard>
  );
}
