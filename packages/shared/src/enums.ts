import { z } from 'zod';

export const EventType = {
  LAN_PARTY: 'LAN_PARTY',
  JUEGO_ONLINE: 'JUEGO_ONLINE',
  PLAN_GATO: 'PLAN_GATO',
  DND: 'DND',
  PASEO: 'PASEO',
  PSICOLOGO: 'PSICOLOGO',
  PELUQUERIA: 'PELUQUERIA',
  OTROS: 'OTROS',
} as const;

export type EventType = (typeof EventType)[keyof typeof EventType];

export const EVENT_TYPES = Object.values(EventType) as [EventType, ...EventType[]];

export const EventTypeSchema = z.enum(EVENT_TYPES);

/** Spanish display labels. The UI is in Spanish. */
export const EVENT_TYPE_LABELS: Readonly<Record<EventType, string>> = {
  LAN_PARTY: 'LAN PARTY',
  JUEGO_ONLINE: 'Juego online',
  PLAN_GATO: 'Plan de Gato',
  DND: 'D&D',
  PASEO: 'Paseo',
  PSICOLOGO: 'Psicólogo',
  PELUQUERIA: 'Peluquería',
  OTROS: 'Otros',
};
