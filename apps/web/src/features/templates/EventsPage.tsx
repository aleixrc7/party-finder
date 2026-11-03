import { EVENT_TYPE_LABELS, type EventTemplate } from '@party-finder/shared';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useCurrentUser } from '@/features/auth/queries';
import { errorMessage } from '@/lib/api/errors';
import { useDeleteTemplate, useTemplatesPage } from './queries';
import { TemplateForm } from './TemplateForm';

function TemplateRow({
  template,
  isOwner,
  onEdit,
  onDelete,
}: {
  template: EventTemplate;
  isOwner: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex gap-3 p-4">
      {template.imageUrl && (
        <img
          src={template.imageUrl}
          alt={`Imagen de ${template.name}`}
          className="size-16 shrink-0 rounded-md border object-cover"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium break-words">{template.name}</h3>
          <Badge>{EVENT_TYPE_LABELS[template.type]}</Badge>
        </div>
        <p className="mt-1 text-sm break-words text-muted-foreground">{template.description}</p>
        <p className="mt-1 text-xs text-muted-foreground">Creado por {template.owner.username}</p>
      </div>
      {isOwner && (
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-start">
          <Button
            variant="outline"
            size="sm"
            aria-label={`Editar ${template.name}`}
            onClick={onEdit}
          >
            Editar
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label={`Eliminar ${template.name}`}
            onClick={onDelete}
          >
            Eliminar
          </Button>
        </div>
      )}
    </li>
  );
}

export function EventsPage() {
  const { user } = useCurrentUser();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<EventTemplate | null>(null);
  const [deleting, setDeleting] = useState<EventTemplate | null>(null);
  const templates = useTemplatesPage(page);
  const deleteTemplate = useDeleteTemplate();

  const closeDelete = () => {
    setDeleting(null);
    deleteTemplate.reset();
  };

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <h1 className="text-2xl font-semibold">Eventos</h1>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <Card className="p-4">
          <TemplateForm
            key={editing?.id ?? 'new'}
            template={editing}
            onDone={() => setEditing(null)}
          />
        </Card>
        <Card>
          {templates.isPending && <LoadingState label="Cargando eventos…" />}
          {templates.isError && (
            <ErrorState
              message={errorMessage(templates.error)}
              onRetry={() => void templates.refetch()}
            />
          )}
          {templates.isSuccess && templates.data.items.length === 0 && (
            <EmptyState title="Todavía no hay eventos">
              <p>Crea el primero con el formulario.</p>
            </EmptyState>
          )}
          {templates.isSuccess && templates.data.items.length > 0 && (
            <>
              <ul aria-label="Lista de eventos" className="divide-y">
                {templates.data.items.map((template) => (
                  <TemplateRow
                    key={template.id}
                    template={template}
                    isOwner={template.owner.id === user?.id}
                    onEdit={() => setEditing(template)}
                    onDelete={() => setDeleting(template)}
                  />
                ))}
              </ul>
              {templates.data.totalPages > 1 && (
                <nav
                  aria-label="Paginación de eventos"
                  className="flex items-center justify-between border-t p-3"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Anterior
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Página {templates.data.page} de {templates.data.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= templates.data.totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    Siguiente
                  </Button>
                </nav>
              )}
            </>
          )}
        </Card>
      </div>
      <ConfirmDialog
        open={deleting !== null}
        title="Eliminar evento"
        description={`¿Seguro que quieres eliminar «${deleting?.name ?? ''}»?`}
        confirmLabel="Eliminar"
        pending={deleteTemplate.isPending}
        error={deleteTemplate.isError ? errorMessage(deleteTemplate.error) : null}
        onCancel={closeDelete}
        onConfirm={() => {
          if (!deleting) {
            return;
          }
          deleteTemplate.mutate(deleting.id, {
            onSuccess: () => {
              if (editing?.id === deleting.id) {
                setEditing(null);
              }
              closeDelete();
            },
          });
        }}
      />
    </div>
  );
}
