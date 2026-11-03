import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { es } from 'date-fns/locale';

const WEEK_OPTIONS = { weekStartsOn: 1 } as const;
const DAYS_PER_WEEK = 7;

export function monthGridDays(month: Date) {
  return eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), WEEK_OPTIONS),
    end: endOfWeek(endOfMonth(month), WEEK_OPTIONS),
  });
}

export function toWeeks<T>(days: T[]) {
  const weeks: T[][] = [];
  for (let start = 0; start < days.length; start += DAYS_PER_WEEK) {
    weeks.push(days.slice(start, start + DAYS_PER_WEEK));
  }
  return weeks;
}

export function weekdayNames() {
  const anyMonday = startOfWeek(new Date(), WEEK_OPTIONS);
  return eachDayOfInterval({
    start: anyMonday,
    end: endOfWeek(anyMonday, WEEK_OPTIONS),
  }).map((day) => ({
    long: format(day, 'EEEE', { locale: es }),
    short: format(day, 'EEE', { locale: es }),
  }));
}

export function toIsoDate(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

export function longDateLabel(date: Date | string) {
  const value = typeof date === 'string' ? parseISO(date) : date;
  return format(value, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es });
}

export function monthLabel(month: Date) {
  return format(month, 'LLLL yyyy', { locale: es });
}

export function scheduleLabel(startTime: string | null, endTime: string | null) {
  if (startTime && endTime) {
    return `${startTime} – ${endTime}`;
  }
  if (startTime) {
    return `Desde las ${startTime}`;
  }
  if (endTime) {
    return `Hasta las ${endTime}`;
  }
  return 'Sin horario definido';
}
