import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  MAX_PAGE_SIZE,
  UPLOAD_IMAGE_FIELD,
  endpoints,
  type CreateEventTemplateRequest,
  type UpdateEventTemplateRequest,
} from '@party-finder/shared';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { callApi } from '@/lib/api/client';

const templatesKey = ['templates'] as const;

export function useTemplatesPage(page: number) {
  return useQuery({
    queryKey: [...templatesKey, 'page', page],
    queryFn: () => callApi(endpoints.listEventTemplates, { query: { page } }),
    placeholderData: keepPreviousData,
  });
}

export function useAllTemplates() {
  return useInfiniteQuery({
    queryKey: [...templatesKey, 'all'],
    queryFn: ({ pageParam }) =>
      callApi(endpoints.listEventTemplates, {
        query: { page: pageParam, pageSize: MAX_PAGE_SIZE },
      }),
    initialPageParam: 1,
    getNextPageParam: ({ page, totalPages }) => (page < totalPages ? page + 1 : undefined),
  });
}

function useInvalidateTemplateData() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: templatesKey }),
      queryClient.invalidateQueries({ queryKey: ['calendar'] }),
    ]);
}

export function useCreateTemplate() {
  const invalidate = useInvalidateTemplateData();
  return useMutation({
    mutationFn: (body: CreateEventTemplateRequest) =>
      callApi(endpoints.createEventTemplate, { body }),
    onSuccess: invalidate,
  });
}

export function useUpdateTemplate() {
  const invalidate = useInvalidateTemplateData();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateEventTemplateRequest }) =>
      callApi(endpoints.updateEventTemplate, { id, body }),
    onSuccess: invalidate,
  });
}

export function useDeleteTemplate() {
  const invalidate = useInvalidateTemplateData();
  return useMutation({
    mutationFn: (id: string) => callApi(endpoints.deleteEventTemplate, { id }),
    onSuccess: invalidate,
  });
}

export function useUploadImage() {
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append(UPLOAD_IMAGE_FIELD, file);
      return callApi(endpoints.uploadImage, { formData });
    },
  });
}

export function imageFileProblem(file: File) {
  if (!(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return 'Solo se admiten imágenes JPEG, PNG o WebP.';
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `La imagen no puede superar los ${MAX_IMAGE_BYTES / (1024 * 1024)} MB.`;
  }
  return null;
}
