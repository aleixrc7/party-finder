import {
  ErrorCode,
  endpoints,
  type LoginRequest,
  type RegisterRequest,
  type ResendVerificationRequest,
  type VerifyEmailResponse,
} from '@party-finder/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { callApi, resetCsrfToken } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';

export const meQueryKey = ['me'] as const;

export function clearSession(queryClient: QueryClient) {
  resetCsrfToken();
  queryClient.setQueryData(meQueryKey, null);
  queryClient.removeQueries({ queryKey: ['templates'] });
  void queryClient.invalidateQueries({ queryKey: ['calendar'] });
}

export function useCurrentUser() {
  const { data, isPending } = useQuery({
    queryKey: meQueryKey,
    queryFn: async () => (await callApi(endpoints.getMe)).user,
    staleTime: 5 * 60 * 1000,
  });
  return { user: data ?? null, isPending };
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginRequest) => callApi(endpoints.login, { body }),
    onSuccess: ({ user }) => {
      resetCsrfToken();
      queryClient.setQueryData(meQueryKey, user);
      void queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => callApi(endpoints.logout),
    onSuccess: () => clearSession(queryClient),
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (body: RegisterRequest) => callApi(endpoints.register, { body }),
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: (body: ResendVerificationRequest) =>
      callApi(endpoints.resendVerification, { body }),
  });
}

export function useVerifyEmail(token: string | null) {
  return useQuery<VerifyEmailResponse, ApiRequestError>({
    queryKey: ['verify-email', token],
    queryFn: () => callApi(endpoints.verifyEmail, { body: { token: token ?? '' } }),
    enabled: token !== null,
    retry: false,
    gcTime: Infinity,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retryOnMount: false,
  });
}

export function isTokenRejected(error: unknown) {
  return (
    error instanceof ApiRequestError &&
    (error.code === ErrorCode.INVALID_OR_EXPIRED_TOKEN || error.code === ErrorCode.VALIDATION_ERROR)
  );
}
