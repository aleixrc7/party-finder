import { endpoints, type CreateCalendarEntryRequest } from '@party-finder/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { callApi } from '@/lib/api/client';

const calendarKey = ['calendar'] as const;

export function useCalendar(from: string, to: string) {
  return useQuery({
    queryKey: [...calendarKey, from, to],
    queryFn: () => callApi(endpoints.getCalendar, { query: { from, to } }),
    placeholderData: keepPreviousData,
  });
}

function useInvalidateCalendar() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: calendarKey });
}

export function useCreateEntry() {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: (body: CreateCalendarEntryRequest) =>
      callApi(endpoints.createCalendarEntry, { body }),
    onSettled: invalidate,
  });
}

export function useDeleteEntry() {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: (id: string) => callApi(endpoints.deleteCalendarEntry, { id }),
    onSettled: invalidate,
  });
}

export function useAttend() {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: (id: string) => callApi(endpoints.attend, { id }),
    onSettled: invalidate,
  });
}

export function useUnattend() {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: (id: string) => callApi(endpoints.unattend, { id }),
    onSettled: invalidate,
  });
}
