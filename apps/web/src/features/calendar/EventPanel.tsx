import { EVENT_TYPE_LABELS, type CalendarEntry } from '@party-finder/shared';
import { CalendarDays, Clock, Users } from 'lucide-react';
import { Link } from 'react-router';
import { ErrorMessage } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/features/auth/queries';
import { errorMessage } from '@/lib/api/errors';
import { routes } from '@/lib/routes';
import { longDateLabel, scheduleLabel } from './dates';
import { useAttend, useUnattend } from './queries';

function AttendanceAction({ entry, isFull }: { entry: CalendarEntry; isFull: boolean }) {
  const attend = useAttend();
  const unattend = useUnattend();
  const pending = attend.isPending || unattend.isPending;
  const error = attend.error ?? unattend.error;

  return (
    <div className="flex flex-col gap-2">
      {entry.isAttending && (
        <Button variant="outline" disabled={pending} onClick={() => unattend.mutate(entry.id)}>
          Desapuntarme
        </Button>
      )}
      {!entry.isAttending && isFull && <Button disabled>Completo</Button>}
      {!entry.isAttending && !isFull && (
        <Button disabled={pending} onClick={() => attend.mutate(entry.id)}>
          Apuntarme
        </Button>
      )}
      {error && <ErrorMessage>{errorMessage(error)}</ErrorMessage>}
    </div>
  );
}

function EntryDetails({ entry }: { entry: CalendarEntry }) {
  const { user } = useCurrentUser();
  const { template } = entry;
  const isFull = entry.attendeeCount >= entry.capacity;

  return (
    <div className="flex flex-col gap-4">
      {template.imageUrl && (
        <img
          src={template.imageUrl}
          alt={`Imagen de ${template.name}`}
          className="aspect-video w-full rounded-lg border object-cover"
        />
      )}
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold break-words">{template.name}</h2>
        <div className="flex flex-wrap gap-2">
          <Badge>{EVENT_TYPE_LABELS[template.type]}</Badge>
          {isFull && <Badge variant="destructive">Completo</Badge>}
        </div>
      </div>
      <p className="text-sm break-words whitespace-pre-line">{template.description}</p>
      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex items-start gap-2">
          <dt className="pt-0.5">
            <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Fecha</span>
          </dt>
          <dd className="first-letter:uppercase">{longDateLabel(entry.date)}</dd>
        </div>
        <div className="flex items-start gap-2">
          <dt className="pt-0.5">
            <Clock className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Horario</span>
          </dt>
          <dd>{scheduleLabel(template.startTime, template.endTime)}</dd>
        </div>
        <div className="flex items-start gap-2">
          <dt className="pt-0.5">
            <Users className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Plazas</span>
          </dt>
          <dd>
            {entry.attendeeCount} de {entry.capacity} plazas ocupadas
          </dd>
        </div>
      </dl>
      <section className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">Asistentes</h3>
        {entry.attendees.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay nadie apuntado.</p>
        ) : (
          <ul aria-label="Asistentes" className="text-sm">
            {entry.attendees.map((attendee) => (
              <li key={attendee.id}>{attendee.username}</li>
            ))}
          </ul>
        )}
      </section>
      {user ? (
        <AttendanceAction entry={entry} isFull={isFull} />
      ) : (
        <p className="text-sm text-muted-foreground">
          <Link
            className="font-medium text-primary underline-offset-4 hover:underline"
            to={routes.login}
          >
            Identifícate
          </Link>{' '}
          para participar en este evento.
        </p>
      )}
    </div>
  );
}

export function EventPanel({ entry }: { entry: CalendarEntry | null }) {
  return (
    <aside
      aria-label="Detalle del evento"
      className="rounded-xl border bg-card p-4 shadow-sm xl:sticky xl:top-6"
    >
      {entry ? (
        <EntryDetails key={entry.id} entry={entry} />
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">No hay evento seleccionado</p>
      )}
    </aside>
  );
}
