import { ErrorCode } from '@party-finder/shared';
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { clearSession } from '@/features/auth/queries';
import { ApiRequestError, hasErrorCode } from '@/lib/api/errors';

const MAX_RETRIES = 3;

function shouldRetry(failureCount: number, error: unknown) {
  const isClientError =
    error instanceof ApiRequestError && error.status >= 400 && error.status < 500;
  return !isClientError && failureCount < MAX_RETRIES;
}

export function createQueryClient() {
  const handleError = (error: unknown) => {
    if (hasErrorCode(error, ErrorCode.UNAUTHENTICATED)) {
      clearSession(client);
    }
  };
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: handleError }),
    mutationCache: new MutationCache({ onError: handleError }),
    defaultOptions: {
      queries: { retry: shouldRetry, staleTime: 30 * 1000 },
    },
  });
  return client;
}
