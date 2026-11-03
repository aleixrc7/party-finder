import {
  EVENT_TYPE_LABELS,
  EventType,
  MAX_EVENTS_PER_DAY,
  type CalendarEntry,
} from '@party-finder/shared';
import { isSameMonth, isToday } from 'date-fns';
import { Plus, Trash2 } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import { longDateLabel, toIsoDate } from './dates';

const TYPE_STYLES: Readonly<Record<EventType, string>> = {
  [EventType.LAN_PARTY]: 'border-l-violet-600 bg-violet-50 text-violet-950',
  [EventType.JUEGO_ONLINE]: 'border-l-sky-600 bg-sky-50 text-sky-950',
  [EventType.PLAN_GATO]: 'border-l-amber-600 bg-amber-50 text-amber-950',
  [EventType.DND]: 'border-l-rose-600 bg-rose-50 text-rose-950',
  [EventType.PASEO]: 'border-l-emerald-600 bg-emerald-50 text-emerald-950',
  [EventType.PSICOLOGO]: 'border-l-teal-600 bg-teal-50 text-teal-950',
  [EventType.PELUQUERIA]: 'border-l-pink-600 bg-pink-50 text-pink-950',
  [EventType.OTROS]: 'border-l-slate-500 bg-slate-100 text-slate-900',
};

function eventCountLabel(count: number) {
  if (count === 0) {
    return 'sin eventos';
  }
  return count === 1 ? '1 evento' : `${count} eventos`;
}

function openMenuFromKeyboard(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) {
    return;
  }
  event.preventDefault();
  const { left, top } = event.currentTarget.getBoundingClientRect();
  event.currentTarget.dispatchEvent(
    new MouseEvent('contextmenu', { bubbles: true, clientX: left + 8, clientY: top + 8 }),
  );
}

interface DayCellProps {
  day: Date;
  visibleMonth: Date;
  entries: CalendarEntry[];
  selectedEntryId: string | null;
  menuEnabled: boolean;
  isTabStop: boolean;
  onSelectEntry: (id: string) => void;
  onAddEntry: (date: string) => void;
  onDeleteEntry: (entry: CalendarEntry) => void;
  onFocusDay: (date: string) => void;
  onGridKeyDown: (event: KeyboardEvent<HTMLDivElement>, date: string) => void;
}

export function DayCell({
  day,
  visibleMonth,
  entries,
  selectedEntryId,
  menuEnabled,
  isTabStop,
  onSelectEntry,
  onAddEntry,
  onDeleteEntry,
  onFocusDay,
  onGridKeyDown,
}: DayCellProps) {
  const date = toIsoDate(day);
  const ownEntries = entries.filter((entry) => entry.canDelete);
  const dayIsFull = entries.length >= MAX_EVENTS_PER_DAY;
  const outside = !isSameMonth(day, visibleMonth);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={!menuEnabled}>
        <div
          role="gridcell"
          data-date={date}
          tabIndex={isTabStop ? 0 : -1}
          aria-label={`${longDateLabel(day)}, ${eventCountLabel(entries.length)}`}
          className={cn(
            'flex min-h-32 min-w-0 flex-col gap-1 border-t border-l p-1 first:border-l-0 focus-visible:outline-2 focus-visible:-outline-offset-2',
            outside && 'bg-muted/60',
          )}
          onFocus={(event) => {
            if (event.target === event.currentTarget) {
              onFocusDay(date);
            }
          }}
          onKeyDown={(event) => {
            if (event.target === event.currentTarget) {
              if (menuEnabled) {
                openMenuFromKeyboard(event);
              }
              onGridKeyDown(event, date);
            }
          }}
        >
          <time
            dateTime={date}
            className={cn(
              'flex size-6 items-center justify-center self-end rounded-full text-xs',
              outside && 'text-muted-foreground',
              isToday(day) && 'bg-primary font-semibold text-primary-foreground',
            )}
          >
            {day.getDate()}
          </time>
          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={entry.id === selectedEntryId}
              className={cn(
                'w-full min-w-0 rounded-sm border-l-3 px-1.5 py-0.5 text-left transition-shadow hover:shadow-sm focus-visible:outline-2',
                TYPE_STYLES[entry.template.type],
                entry.id === selectedEntryId && 'ring-2 ring-primary',
              )}
              onClick={() => onSelectEntry(entry.id)}
            >
              <span className="block truncate text-xs font-medium">{entry.template.name}</span>
              <span className="block truncate text-[0.6875rem] leading-tight">
                {EVENT_TYPE_LABELS[entry.template.type]}
              </span>
            </button>
          ))}
        </div>
      </ContextMenuTrigger>
      {menuEnabled && (
        <ContextMenuContent>
          <ContextMenuItem disabled={dayIsFull} onSelect={() => onAddEntry(date)}>
            <Plus aria-hidden="true" />
            Añadir evento
          </ContextMenuItem>
          {ownEntries.length > 0 && (
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <Trash2 aria-hidden="true" />
                Eliminar evento
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                {ownEntries.map((entry) => (
                  <ContextMenuItem key={entry.id} onSelect={() => onDeleteEntry(entry)}>
                    <span className="max-w-56 truncate">{entry.template.name}</span>
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          )}
        </ContextMenuContent>
      )}
    </ContextMenu>
  );
}
