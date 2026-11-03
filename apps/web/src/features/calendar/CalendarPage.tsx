import type { CalendarEntry } from '@party-finder/shared';
import { addMonths, startOfMonth, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/features/auth/queries';
import { errorMessage } from '@/lib/api/errors';
import { AddEntryDialog } from './AddEntryDialog';
import { monthGridDays, monthLabel, toIsoDate } from './dates';
import { EventPanel } from './EventPanel';
import { MonthGrid } from './MonthGrid';
import { useCalendar, useDeleteEntry } from './queries';

const NO_ENTRIES: CalendarEntry[] = [];

export function CalendarPage() {
  const { user } = useCurrentUser();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [addingDate, setAddingDate] = useState<string | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<CalendarEntry | null>(null);
  const lastMenuDateRef = useRef<string | null>(null);

  const days = useMemo(() => monthGridDays(month), [month]);
  const from = toIsoDate(days[0] ?? month);
  const to = toIsoDate(days[days.length - 1] ?? month);
  const calendar = useCalendar(from, to);
  const deleteEntry = useDeleteEntry();

  const entries = calendar.data?.entries ?? NO_ENTRIES;
  const selectedEntry = entries.find(({ id }) => id === selectedEntryId) ?? null;
  const showingCurrentRange = calendar.isSuccess && !calendar.isPlaceholderData;

  const closeDelete = () => {
    setDeletingEntry(null);
    deleteEntry.reset();
  };

  return (
    <div className="grid items-start gap-4 p-4 md:p-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <section aria-label="Calendario" className="flex min-w-0 flex-col gap-3">
        <header className="flex flex-wrap items-center gap-2">
          <h1 className="min-w-44 text-2xl font-semibold first-letter:uppercase">
            {monthLabel(month)}
          </h1>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="outline" onClick={() => setMonth(startOfMonth(new Date()))}>
              Hoy
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Mes anterior"
              onClick={() => setMonth(subMonths(month, 1))}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Mes siguiente"
              onClick={() => setMonth(addMonths(month, 1))}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </header>
        {calendar.isError && !calendar.data ? (
          <ErrorState
            message={errorMessage(calendar.error)}
            onRetry={() => void calendar.refetch()}
          />
        ) : (
          <>
            {!showingCurrentRange && <LoadingState label="Cargando eventos…" />}
            {showingCurrentRange && entries.length === 0 && (
              <p className="text-sm text-muted-foreground">No hay eventos este mes.</p>
            )}
            <div className="overflow-x-auto">
              <div className="min-w-[44rem]">
                <MonthGrid
                  month={month}
                  entries={showingCurrentRange ? entries : NO_ENTRIES}
                  selectedEntryId={selectedEntry?.id ?? null}
                  menuEnabled={user !== null && showingCurrentRange}
                  onSelectEntry={setSelectedEntryId}
                  onAddEntry={(date) => {
                    lastMenuDateRef.current = date;
                    setAddingDate(date);
                  }}
                  onDeleteEntry={setDeletingEntry}
                />
              </div>
            </div>
          </>
        )}
      </section>
      <EventPanel entry={selectedEntry} />
      <AddEntryDialog
        date={addingDate}
        onClose={() => setAddingDate(null)}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          document.querySelector<HTMLElement>(`[data-date="${lastMenuDateRef.current}"]`)?.focus();
        }}
      />
      <ConfirmDialog
        open={deletingEntry !== null}
        title="Eliminar evento"
        description={`Se eliminará «${deletingEntry?.template.name ?? ''}» de este día, junto con sus asistentes.`}
        confirmLabel="Eliminar"
        pending={deleteEntry.isPending}
        error={deleteEntry.isError ? errorMessage(deleteEntry.error) : null}
        onCancel={closeDelete}
        onConfirm={() => {
          if (deletingEntry) {
            deleteEntry.mutate(deletingEntry.id, { onSuccess: closeDelete });
          }
        }}
      />
    </div>
  );
}
