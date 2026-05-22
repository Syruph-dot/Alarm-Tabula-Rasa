import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const DEFAULT_VERSION = 1;
const DEFAULT_TZ = '+08:00';

function clone(value) {
  return structuredClone(value);
}

function dateFromTime(date, time) {
  if (!/^\d{2}:\d{2}$/.test(String(time))) throw new Error('time must use HH:mm');
  return new Date(`${date}T${time}:00${DEFAULT_TZ}`);
}

function formatLocalDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${d}T${h}:${m}:00${DEFAULT_TZ}`;
}

function slug(value, fallback = 'item') {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

function normalizeStore(raw) {
  return {
    version: raw.version ?? DEFAULT_VERSION,
    metadata: raw.metadata ?? {},
    fixedEvents: raw.fixedEvents ?? {},
    reminderItems: raw.reminderItems ?? [],
    comparisonHistory: raw.comparisonHistory ?? [],
    generatedTables: raw.generatedTables ?? {},
    settings: {
      dayStart: '08:00',
      dayEnd: '23:00',
      alarmSeconds: 30,
      clickToDismiss: true,
      defaultReminderDurationMinutes: 30,
      minimumFillMinutes: 15,
      defaultEarlyEndCooldownMinutes: 180,
      reminderLeadMinutes: 0,
      ...raw.settings,
    },
    runtime: {
      timeMode: 'real',
      mockNow: raw.metadata?.date ? `${raw.metadata.date}T11:45:00${DEFAULT_TZ}` : null,
      paused: false,
      itemCooldowns: [],
      alarmLog: [],
      ...raw.runtime,
    },
  };
}

export function getDefaultStorePath(userDataPath) {
  return join(userDataPath, 'data.json');
}

export async function loadAppStore(storePath) {
  return normalizeStore(JSON.parse(await readFile(storePath, 'utf-8')));
}

export async function saveAppStore(storePath, store) {
  await mkdir(dirname(storePath), { recursive: true });
  const normalized = normalizeStore(store);
  await writeFile(storePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf-8');
  return normalized;
}

export async function ensureAppStore({ userDataPath, samplePath }) {
  const storePath = getDefaultStorePath(userDataPath);
  if (existsSync(storePath)) return loadAppStore(storePath);

  const raw = JSON.parse(await readFile(resolve(samplePath), 'utf-8'));
  const store = normalizeStore({
    ...raw,
    version: DEFAULT_VERSION,
    runtime: {
      timeMode: 'real',
      mockNow: raw.metadata?.date ? `${raw.metadata.date}T11:45:00${DEFAULT_TZ}` : null,
      paused: false,
      itemCooldowns: [],
      alarmLog: [],
    },
  });
  await saveAppStore(storePath, store);
  return store;
}

export function updateSettings(store, patch) {
  const next = clone(store);
  const { timeMode, mockNow, paused, ...settingsPatch } = patch;
  next.settings = { ...next.settings, ...settingsPatch };
  next.runtime = {
    ...next.runtime,
    ...(timeMode ? { timeMode } : {}),
    ...(mockNow ? { mockNow } : {}),
    ...(typeof paused === 'boolean' ? { paused } : {}),
  };
  return normalizeStore(next);
}

export function addReminderItem(store, input) {
  const label = String(input.label ?? '').trim();
  if (!label) throw new Error('label is required');

  const id = input.id ?? `item-${slug(label)}-${Date.now().toString(36)}`;
  const item = {
    id,
    label,
    defaultDurationMinutes: Number(input.defaultDurationMinutes ?? store.settings?.defaultReminderDurationMinutes ?? 30),
    active: input.active ?? true,
    importanceScore: Number(input.importanceScore ?? 1450),
    confidence: Number(input.confidence ?? 0.1),
    lastComparedAt: null,
    lastScheduledAt: null,
    lastTouchedAt: null,
  };

  return normalizeStore({
    ...store,
    reminderItems: [
      ...store.reminderItems.filter(existing => existing.id !== id),
      item,
    ],
  });
}

export function archiveReminderItem(store, itemId, at = new Date()) {
  return normalizeStore({
    ...store,
    reminderItems: store.reminderItems.map(item => item.id === itemId
      ? { ...item, active: false, archivedAt: new Date(at).toISOString() }
      : item),
  });
}

export function addFixedEvent(store, input) {
  const date = String(input.date ?? '').trim();
  const label = String(input.label ?? '').trim();
  if (!date) throw new Error('date is required');
  if (!label) throw new Error('label is required');

  const start = input.startTime instanceof Date
    ? input.startTime
    : dateFromTime(date, input.startTime);
  const end = input.endTime
    ? (input.endTime instanceof Date ? input.endTime : dateFromTime(date, input.endTime))
    : new Date(start.getTime() + Number(input.durationMinutes) * 60000);
  if (end <= start) throw new Error('event must end after it starts');

  const h1 = String(start.getHours()).padStart(2, '0') + String(start.getMinutes()).padStart(2, '0');
  const h2 = String(end.getHours()).padStart(2, '0') + String(end.getMinutes()).padStart(2, '0');
  const event = {
    id: input.id ?? `${input.source ?? 'fixed'}-${date}-${slug(label, 'event')}-${h1}-${h2}`,
    label,
    startTime: formatLocalDateTime(start),
    endTime: formatLocalDateTime(end),
    source: input.source ?? 'fixed',
    metadata: input.metadata ?? {},
  };
  const dayEvents = store.fixedEvents?.[date] ?? [];

  return normalizeStore({
    ...store,
    fixedEvents: {
      ...store.fixedEvents,
      [date]: [
        ...dayEvents.filter(existing => existing.id !== event.id),
        event,
      ].sort((a, b) => new Date(a.startTime) - new Date(b.startTime)),
    },
  });
}

export function updateFixedEventEnd(store, input = {}) {
  const eventId = String(input.eventId ?? '').trim();
  if (!eventId) throw new Error('eventId is required');
  const rawEndTime = input.endTime ?? input.now;
  if (!rawEndTime) throw new Error('endTime is required');
  const end = rawEndTime instanceof Date ? rawEndTime : new Date(rawEndTime);
  if (Number.isNaN(end.getTime())) throw new Error('endTime is invalid');

  let found = false;
  const fixedEvents = Object.fromEntries(Object.entries(store.fixedEvents ?? {}).map(([date, events]) => {
    const dayEvents = (events ?? []).map(event => {
      if (event.id !== eventId) return event;
      found = true;
      const start = new Date(event.startTime);
      if (end <= start) throw new Error('fixed event must end after it starts');
      return {
        ...event,
        endTime: formatLocalDateTime(end),
      };
    }).sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    return [date, dayEvents];
  }));

  if (!found) throw new Error('fixed event not found');
  return normalizeStore({ ...store, fixedEvents });
}

export function adjustFixedEventEnd(store, input = {}) {
  const eventId = String(input.eventId ?? '').trim();
  if (!eventId) throw new Error('eventId is required');
  const deltaMinutes = Number(input.deltaMinutes ?? 0);
  if (!Number.isFinite(deltaMinutes) || deltaMinutes === 0) throw new Error('deltaMinutes is required');

  const now = input.now ? new Date(input.now) : null;
  let eventToUpdate = null;
  for (const events of Object.values(store.fixedEvents ?? {})) {
    eventToUpdate = (events ?? []).find(event => event.id === eventId);
    if (eventToUpdate) break;
  }
  if (!eventToUpdate) throw new Error('fixed event not found');

  const requestedEnd = new Date(new Date(eventToUpdate.endTime).getTime() + deltaMinutes * 60000);
  const minEnd = now && requestedEnd < now ? now : requestedEnd;
  return updateFixedEventEnd(store, {
    eventId,
    endTime: minEnd,
  });
}

export function cancelFixedEvent(store, input) {
  const eventId = String(typeof input === 'object' ? input?.eventId : input ?? '').trim();
  if (!eventId) throw new Error('eventId is required');

  let found = false;
  const fixedEvents = {};
  for (const [date, events] of Object.entries(store.fixedEvents ?? {})) {
    const remaining = (events ?? []).filter(event => {
      if (event.id !== eventId) return true;
      found = true;
      return false;
    });
    if (remaining.length > 0) fixedEvents[date] = remaining;
  }

  if (!found) throw new Error('fixed event not found');
  return normalizeStore({ ...store, fixedEvents });
}
