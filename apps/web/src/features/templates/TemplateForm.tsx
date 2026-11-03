import { zodResolver } from '@hookform/resolvers/zod';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  CreateEventTemplateRequestSchema,
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  MAX_CAPACITY,
  MIN_CAPACITY,
  TEMPLATE_DESCRIPTION_MAX_LENGTH,
  TEMPLATE_NAME_MAX_LENGTH,
  type CreateEventTemplateRequest,
  type CreateEventTemplateRequestInput,
  type EventTemplate,
  type UpdateEventTemplateRequest,
} from '@party-finder/shared';
import { type ChangeEvent, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { controlProps, FormField } from '@/components/FormField';
import { ErrorMessage } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/components/ui/form-controls';
import { errorMessage, fieldErrors } from '@/lib/api/errors';
import { imageFileProblem, useCreateTemplate, useUpdateTemplate, useUploadImage } from './queries';

const TemplateFormSchema = CreateEventTemplateRequestSchema.extend({
  type: z.enum(EVENT_TYPES, { error: 'Selecciona un tipo' }),
});

const TEMPLATE_FIELDS = [
  'name',
  'description',
  'type',
  'imageUrl',
  'attendees',
  'startTime',
  'endTime',
] as const;
type TemplateField = (typeof TEMPLATE_FIELDS)[number];

const CAPACITY_OPTIONS = Array.from(
  { length: MAX_CAPACITY - MIN_CAPACITY + 1 },
  (_, index) => MIN_CAPACITY + index,
);

function isTemplateField(field: string): field is TemplateField {
  return (TEMPLATE_FIELDS as readonly string[]).includes(field);
}

function changedFields(
  template: EventTemplate,
  values: CreateEventTemplateRequest,
): UpdateEventTemplateRequest {
  const changes: Record<string, unknown> = {};
  for (const field of TEMPLATE_FIELDS) {
    const value = values[field] ?? null;
    if (value !== template[field]) {
      changes[field] = value;
    }
  }
  return changes;
}

function nullWhenEmpty(value: unknown) {
  return value === '' || value === undefined ? null : value;
}

function optionalNumber(value: unknown) {
  return value === '' || value === null || value === undefined ? null : Number(value);
}

interface TemplateFormProps {
  template: EventTemplate | null;
  onDone: () => void;
}

export function TemplateForm({ template, onDone }: TemplateFormProps) {
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const uploadImage = useUploadImage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageProblem, setImageProblem] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    reset,
    watch,
    formState: { errors },
  } = useForm<CreateEventTemplateRequestInput, unknown, CreateEventTemplateRequest>({
    resolver: zodResolver(TemplateFormSchema),
    defaultValues: {
      name: template?.name ?? '',
      description: template?.description ?? '',
      type: template?.type,
      imageUrl: template?.imageUrl ?? null,
      attendees: template?.attendees ?? null,
      startTime: template?.startTime ?? null,
      endTime: template?.endTime ?? null,
    },
  });
  const imageUrl = watch('imageUrl');
  const saving = createTemplate.isPending || updateTemplate.isPending;
  const saveError = createTemplate.error ?? updateTemplate.error;

  const showServerErrors = (error: unknown) => {
    for (const { field, message } of fieldErrors(error)) {
      if (isTemplateField(field)) {
        setError(field, { message });
      }
    }
  };

  const finish = () => {
    reset();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onDone();
  };

  const onSubmit = (values: CreateEventTemplateRequest) => {
    if (!template) {
      createTemplate.mutate(values, { onSuccess: finish, onError: showServerErrors });
      return;
    }
    const body = changedFields(template, values);
    if (Object.keys(body).length === 0) {
      finish();
      return;
    }
    updateTemplate.mutate(
      { id: template.id, body },
      { onSuccess: finish, onError: showServerErrors },
    );
  };

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const problem = imageFileProblem(file);
    setImageProblem(problem);
    uploadImage.reset();
    if (problem) {
      event.target.value = '';
      return;
    }
    uploadImage.mutate(file, {
      onSuccess: ({ url }) => setValue('imageUrl', url),
      onError: () => {
        event.target.value = '';
      },
    });
  };

  const removeImage = () => {
    setValue('imageUrl', null);
    setImageProblem(null);
    uploadImage.reset();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const imageError = imageProblem ?? (uploadImage.isError ? errorMessage(uploadImage.error) : null);

  return (
    <form
      noValidate
      aria-label={template ? 'Editar evento' : 'Crear evento'}
      className="flex flex-col gap-4"
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
    >
      <h2 className="text-lg font-semibold">{template ? 'Editar evento' : 'Crear evento'}</h2>
      <FormField id="template-name" label="Nombre" error={errors.name?.message} required>
        <Input
          maxLength={TEMPLATE_NAME_MAX_LENGTH}
          {...controlProps('template-name', errors.name?.message)}
          {...register('name')}
        />
      </FormField>
      <FormField
        id="template-description"
        label="Descripción"
        error={errors.description?.message}
        required
      >
        <Textarea
          maxLength={TEMPLATE_DESCRIPTION_MAX_LENGTH}
          {...controlProps('template-description', errors.description?.message)}
          {...register('description')}
        />
      </FormField>
      <FormField id="template-type" label="Tipo" error={errors.type?.message} required>
        <NativeSelect
          {...controlProps('template-type', errors.type?.message)}
          {...register('type')}
        >
          <option value="">Selecciona un tipo</option>
          {EVENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {EVENT_TYPE_LABELS[type]}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField id="template-image" label="Imagen" error={errors.imageUrl?.message}>
        <Input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_IMAGE_MIME_TYPES.join(',')}
          className="py-1.5"
          disabled={uploadImage.isPending}
          onChange={handleFile}
          {...controlProps('template-image', errors.imageUrl?.message)}
        />
      </FormField>
      {uploadImage.isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          Subiendo imagen…
        </p>
      )}
      {imageError && <ErrorMessage>{imageError}</ErrorMessage>}
      {imageUrl && (
        <div className="flex items-center gap-3">
          <img
            src={imageUrl}
            alt="Vista previa de la imagen del evento"
            className="size-16 rounded-md border object-cover"
          />
          <Button type="button" variant="outline" size="sm" onClick={removeImage}>
            Quitar imagen
          </Button>
        </div>
      )}
      <FormField id="template-attendees" label="Asistentes" error={errors.attendees?.message}>
        <NativeSelect
          {...controlProps('template-attendees', errors.attendees?.message)}
          {...register('attendees', { setValueAs: optionalNumber })}
        >
          <option value="">Sin definir</option>
          {CAPACITY_OPTIONS.map((capacity) => (
            <option key={capacity} value={capacity}>
              {capacity}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField id="template-start" label="Hora de inicio" error={errors.startTime?.message}>
          <Input
            type="time"
            {...controlProps('template-start', errors.startTime?.message)}
            {...register('startTime', { setValueAs: nullWhenEmpty })}
          />
        </FormField>
        <FormField id="template-end" label="Hora de fin" error={errors.endTime?.message}>
          <Input
            type="time"
            {...controlProps('template-end', errors.endTime?.message)}
            {...register('endTime', { setValueAs: nullWhenEmpty })}
          />
        </FormField>
      </div>
      {saveError && <ErrorMessage>{errorMessage(saveError)}</ErrorMessage>}
      <div className="flex justify-end gap-2">
        {template && (
          <Button type="button" variant="outline" onClick={onDone}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={saving || uploadImage.isPending}>
          {saving ? 'Guardando…' : template ? 'Guardar cambios' : 'Crear evento'}
        </Button>
      </div>
    </form>
  );
}
