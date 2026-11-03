import type { CalendarEntry } from '@party-finder/shared';
import { addDays, isSameMonth, parseISO, startOfMonth } from 'date-fns';
import { type KeyboardEvent, useMemo, useRef, useState } from 'react';
import { monthGridDays, toIsoDate, toWeeks, weekdayNames } from './dates';
import { DayCell } from './DayCell';

const ARROW_DAY_OFFSETS: Readonly<Record<string, number>> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
};

interface MonthGridProps {
  month: Date;
  entries: CalendarEntry[];
  selectedEntryId: string | null;
  menuEnabled: boolean;
  onSelectEntry: (id: string) => void;
  onAddEntry: (date: string) => void;
  onDeleteEntry: (entry: CalendarEntry) => void;
}

export function MonthGrid({
  month,
  entries,
  selectedEntryId,
  menuEnabled,
  onSelectEntry,
  onAddEntry,
  onDeleteEntry,
}: MonthGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [focusedDate, setFocusedDate] = useState<string | null>(null);
  const days = useMemo(() => monthGridDays(month), [month]);
  const isoDays = useMemo(() => new Set(days.map(toIsoDate)), [days]);

  const entriesByDate = useMemo(() => {
    const grouped = new Map<string, CalendarEntry[]>();
    for (const entry of entries) {
      grouped.set(entry.date, [...(grouped.get(entry.date) ?? []), entry]);
    }
    return grouped;
  }, [entries]);

  const today = new Date();
  const defaultTabStop = toIsoDate(isSameMonth(today, month) ? today : startOfMonth(month));
  const tabStop = focusedDate && isoDays.has(focusedDate) ? focusedDate : defaultTabStop;

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>, date: string) => {
    const offset = ARROW_DAY_OFFSETS[event.key];
    if (offset === undefined) {
      return;
    }
    const target = toIsoDate(addDays(parseISO(date), offset));
    if (!isoDays.has(target)) {
      return;
    }
    event.preventDefault();
    setFocusedDate(target);
    gridRef.current?.querySelector<HTMLElement>(`[data-date="${target}"]`)?.focus();
  };

  return (
    <div
      ref={gridRef}
      role="grid"
      aria-label="Calendario mensual"
      className="overflow-hidden rounded-xl border bg-card shadow-sm"
    >
      <div role="row" className="grid grid-cols-7 bg-muted">
        {weekdayNames().map(({ long, short }) => (
          <div
            key={long}
            role="columnheader"
            aria-label={long}
            className="px-2 py-2 text-center text-xs font-medium text-muted-foreground capitalize"
          >
            {short}
          </div>
        ))}
      </div>
      {toWeeks(days).map((week) => (
        <div key={toIsoDate(week[0] ?? month)} role="row" className="grid grid-cols-7">
          {week.map((day) => {
            const date = toIsoDate(day);
            return (
              <DayCell
                key={date}
                day={day}
                visibleMonth={month}
                entries={entriesByDate.get(date) ?? []}
                selectedEntryId={selectedEntryId}
                menuEnabled={menuEnabled}
                isTabStop={date === tabStop}
                onSelectEntry={onSelectEntry}
                onAddEntry={onAddEntry}
                onDeleteEntry={onDeleteEntry}
                onFocusDay={setFocusedDate}
                onGridKeyDown={moveFocus}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
