import { EventType, type EventTemplate, type UserSummary } from '@party-finder/shared';
import { addDays, format, startOfMonth } from 'date-fns';

export interface MockUser extends UserSummary {
  email: string;
  password: string;
  verified: boolean;
}

export interface MockEntry {
  id: string;
  date: string;
  capacity: number;
  addedById: string;
  templateId: string;
  attendeeIds: string[];
  createdAt: string;
}

export const MOCK_PASSWORD = 'party-finder-dev';
const CREATED_AT = '2026-10-01T10:00:00.000Z';

function makeUser(index: number, username: string, verified: boolean): MockUser {
  return {
    id: `00000000-0000-4000-8000-00000000000${index}`,
    username,
    email: `${username}@example.com`,
    password: MOCK_PASSWORD,
    verified,
  };
}

function makeTemplate(
  index: number,
  owner: MockUser,
  fields: Pick<
    EventTemplate,
    'name' | 'description' | 'type' | 'attendees' | 'startTime' | 'endTime'
  >,
): EventTemplate {
  return {
    id: `10000000-0000-4000-8000-00000000000${index}`,
    owner: { id: owner.id, username: owner.username },
    imageUrl: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...fields,
  };
}

function createInitialState() {
  const ana = makeUser(1, 'ana', true);
  const bruno = makeUser(2, 'bruno', true);
  const carla = makeUser(3, 'carla', true);
  const dani = makeUser(4, 'dani', false);

  const lanParty = makeTemplate(1, ana, {
    name: 'LAN en casa de Ana',
    description: 'Trae tu ordenador y una regleta.',
    type: EventType.LAN_PARTY,
    attendees: 6,
    startTime: '18:00',
    endTime: '23:30',
  });
  const dnd = makeTemplate(2, bruno, {
    name: 'Campaña de D&D',
    description: 'Sesión semanal de la campaña.',
    type: EventType.DND,
    attendees: 4,
    startTime: '20:00',
    endTime: null,
  });
  const walk = makeTemplate(3, ana, {
    name: 'Paseo por el parque',
    description: 'Paseo tranquilo y sin prisa.',
    type: EventType.PASEO,
    attendees: null,
    startTime: null,
    endTime: null,
  });

  const firstOfMonth = startOfMonth(new Date());
  const dayOfMonth = (day: number) => format(addDays(firstOfMonth, day - 1), 'yyyy-MM-dd');
  const makeEntry = (
    index: number,
    date: string,
    capacity: number,
    addedBy: MockUser,
    template: EventTemplate,
    attendees: MockUser[],
  ): MockEntry => ({
    id: `20000000-0000-4000-8000-0000000000${String(index).padStart(2, '0')}`,
    date,
    capacity,
    addedById: addedBy.id,
    templateId: template.id,
    attendeeIds: attendees.map(({ id }) => id),
    createdAt: CREATED_AT,
  });

  return {
    users: [ana, bruno, carla, dani],
    templates: [lanParty, dnd, walk],
    entries: [
      makeEntry(1, dayOfMonth(10), 5, ana, lanParty, [bruno]),
      makeEntry(2, dayOfMonth(10), 1, bruno, dnd, [carla]),
      makeEntry(3, dayOfMonth(12), 4, ana, lanParty, []),
      makeEntry(4, dayOfMonth(12), 4, ana, dnd, []),
      makeEntry(5, dayOfMonth(12), 4, bruno, walk, []),
      makeEntry(6, dayOfMonth(12), 4, bruno, lanParty, []),
    ],
    currentUserId: null as string | null,
    csrfToken: 'mock-csrf-anonymous',
    verificationTokens: new Map<string, string>([['mock-token-dani', dani.id]]),
    uploadedImages: new Map<string, { bytes: ArrayBuffer; contentType: string }>(),
  };
}

export type MockState = ReturnType<typeof createInitialState>;

export let mockState: MockState = createInitialState();

export function resetMockState() {
  mockState = createInitialState();
}

export function signInAs(username: string) {
  const user = mockState.users.find((candidate) => candidate.username === username);
  mockState.currentUserId = user?.id ?? null;
}

export function currentUser() {
  return mockState.users.find(({ id }) => id === mockState.currentUserId) ?? null;
}
