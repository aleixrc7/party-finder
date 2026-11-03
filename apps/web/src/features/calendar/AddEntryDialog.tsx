import { MAX_CAPACITY, MIN_CAPACITY } from '@party-finder/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { controlProps, FormField } from '@/components/FormField';
import { EmptyState, ErrorMessage, ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { NativeSelect } from '@/components/ui/form-controls';
import { useAllTemplates } from '@/features/templates/queries';
import { errorMessage } from '@/lib/api/errors';
import { routes } from '@/lib/routes';
import { longDateLabel } from './dates';
import { useCreateEntry } from './queries';

const CAPACITY_OPTIONS = Array.from(
  { length: MAX_CAPACITY - MIN_CAPACITY + 1 },
  (_, index) => MIN_CAPACITY + index,
);

function AddEntryForm({ date, onClose }: { date: string; onClose: () => void }) {
  const templates = useAllTemplates();
  const createEntry = useCreateEntry();
  const [chosenTemplateId, setChosenTemplateId] = useState<string | null>(null);
  const [chosenCapacity, setChosenCapacity] = useState<number | null>(null);

  if (templates.isPending) {
    return <LoadingState label="Cargando eventos…" />;
  }
  if (templates.isError) {
    return (
      <ErrorState
        message={errorMessage(templates.error)}
        onRetry={() => void templates.refetch()}
      />
    );
  }

  const options = templates.data.pages.flatMap((page) => page.items);
  const template = options.find(({ id }) => id === chosenTemplateId) ?? options[0];
  if (!template) {
    return (
      <EmptyState title="Todavía no hay eventos">
        <Link
          className="font-medium text-primary underline-offset-4 hover:underline"
          to={routes.events}
        >
          Crea uno en Eventos
        </Link>
      </EmptyState>
    );
  }
  const capacity = chosenCapacity ?? template.attendees ?? MIN_CAPACITY;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    createEntry.mutate({ templateId: template.id, date, capacity }, { onSuccess: onClose });
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <FormField id="entry-template" label="Evento" required>
        <NativeSelect
          {...controlProps('entry-template')}
          value={template.id}
          onChange={(event) => {
            setChosenTemplateId(event.target.value);
            setChosenCapacity(null);
          }}
        >
          {options.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      {templates.hasNextPage && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={templates.isFetchingNextPage}
          onClick={() => void templates.fetchNextPage()}
        >
          Cargar más eventos
        </Button>
      )}
      <FormField id="entry-capacity" label="Plazas" required>
        <NativeSelect
          {...controlProps('entry-capacity')}
          value={capacity}
          onChange={(event) => setChosenCapacity(Number(event.target.value))}
        >
          {CAPACITY_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      {createEntry.isError && <ErrorMessage>{errorMessage(createEntry.error)}</ErrorMessage>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={createEntry.isPending}>
          {createEntry.isPending ? 'Añadiendo…' : 'Añadir evento'}
        </Button>
      </div>
    </form>
  );
}

interface AddEntryDialogProps {
  date: string | null;
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
}

export function AddEntryDialog({ date, onClose, onCloseAutoFocus }: AddEntryDialogProps) {
  return (
    <Dialog open={date !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <DialogTitle>Añadir evento</DialogTitle>
        <DialogDescription className="first-letter:uppercase">
          {date && longDateLabel(date)}
        </DialogDescription>
        {date && <AddEntryForm date={date} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}
