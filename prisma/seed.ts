/**
 * Development seed: 3 users, 5 templates and calendar entries in the current month.
 * It WIPES the four tables first, so it can be re-run at will. Never run it in production.
 *
 * Every seeded user has the password in SEED_USER_PASSWORD (default below).
 */
import { hash } from '@node-rs/argon2';
import { EventType, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = 'party-finder-dev';

/** A day of the current UTC month as a `DATE`-friendly value (midnight UTC). */
function dayOfCurrentMonth(day: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day));
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed: NODE_ENV is "production".');
  }

  // Argon2id with the library defaults, the same algorithm the API uses.
  const passwordHash = await hash(process.env.SEED_USER_PASSWORD ?? DEFAULT_PASSWORD);

  await prisma.$transaction([
    prisma.attendance.deleteMany(),
    prisma.calendarEntry.deleteMany(),
    prisma.eventTemplate.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  const [ana, bruno, carla] = await Promise.all(
    ['ana', 'bruno', 'carla'].map((username) =>
      prisma.user.create({ data: { username, passwordHash } }),
    ),
  );
  if (!ana || !bruno || !carla) throw new Error('Failed to create seed users');

  const lan = await prisma.eventTemplate.create({
    data: {
      ownerId: ana.id,
      name: 'LAN en casa de Ana',
      description: 'Trae tu PC y cable de red. Habrá pizza.',
      type: EventType.LAN_PARTY,
      attendees: 6,
      startTime: '18:00',
      endTime: '03:00',
    },
  });
  const dnd = await prisma.eventTemplate.create({
    data: {
      ownerId: bruno.id,
      name: 'Campaña de D&D',
      description: 'Sesión semanal de la campaña. Fichas a nivel 5.',
      type: EventType.DND,
      attendees: 4,
      startTime: '17:00',
      endTime: '21:00',
    },
  });
  const paseo = await prisma.eventTemplate.create({
    data: {
      ownerId: carla.id,
      name: 'Paseo por el parque',
      description: 'Vuelta tranquila de una hora. Punto de encuentro: la fuente.',
      type: EventType.PASEO,
      attendees: 10,
      startTime: '10:00',
    },
  });
  const online = await prisma.eventTemplate.create({
    data: {
      ownerId: ana.id,
      name: 'Noche de juego online',
      description: 'Partidas online por Discord.',
      type: EventType.JUEGO_ONLINE,
      attendees: 5,
      startTime: '22:00',
      endTime: '01:00',
    },
  });
  const gato = await prisma.eventTemplate.create({
    data: {
      ownerId: bruno.id,
      name: 'Plan de Gato',
      description: 'Tarde de sofá, mantita y gatos.',
      type: EventType.PLAN_GATO,
    },
  });

  type SeedEntry = {
    templateId: string;
    day: number;
    capacity: number;
    addedById: string;
    attendeeIds: string[];
  };

  const entries: SeedEntry[] = [
    { templateId: lan.id, day: 5, capacity: 6, addedById: ana.id, attendeeIds: [ana.id, bruno.id] },
    // Day 12 has MAX_EVENTS_PER_DAY entries: adding a fifth must fail with DAY_FULL.
    { templateId: dnd.id, day: 12, capacity: 4, addedById: bruno.id, attendeeIds: [bruno.id] },
    { templateId: paseo.id, day: 12, capacity: 10, addedById: carla.id, attendeeIds: [] },
    { templateId: online.id, day: 12, capacity: 5, addedById: ana.id, attendeeIds: [carla.id] },
    // Full entry: bruno attending must fail with ENTRY_FULL.
    {
      templateId: gato.id,
      day: 12,
      capacity: 2,
      addedById: bruno.id,
      attendeeIds: [ana.id, carla.id],
    },
    { templateId: paseo.id, day: 20, capacity: 3, addedById: carla.id, attendeeIds: [carla.id] },
    { templateId: dnd.id, day: 26, capacity: 4, addedById: bruno.id, attendeeIds: [] },
  ];

  for (const entry of entries) {
    await prisma.calendarEntry.create({
      data: {
        templateId: entry.templateId,
        date: dayOfCurrentMonth(entry.day),
        capacity: entry.capacity,
        addedById: entry.addedById,
        attendances: { create: entry.attendeeIds.map((userId) => ({ userId })) },
      },
    });
  }

  console.log(
    `Seeded 3 users (ana, bruno, carla), 5 templates and ${entries.length} calendar entries.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
