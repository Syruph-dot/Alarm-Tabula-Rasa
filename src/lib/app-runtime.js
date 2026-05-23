import {
  addBreakAndReschedule,
  extendBlockAndReschedule,
  moveBlockEndAndReschedule,
} from '../prototypes/free-time-engine/engine.mjs';
import {
  buildDayPlan,
  createLockedBlockEvent,
  rebuildPlanAfterPreferenceChoice,
  rebuildPlanAfterTemporaryEvent,
} from './day-planner.js';
import { getDueAlarm, getNextAlarm } from './alarm-presenter.js';
import { choosePreferencePair } from './preference-sampler.js';
import { getCourseEventsForDate } from './course-table-import.js';

function clone(value) {
  return structuredClone(value);
}

function localDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function runtimeNow(store, options = {}) {
  if (store.runtime?.timeMode === 'mock' && store.runtime?.mockNow) {
    return new Date(store.runtime.mockNow);
  }
  return new Date(options.systemNow ?? Date.now());
}

function planSettings(store, date) {
  return {
    ...store.settings,
    date,
    itemCooldowns: store.runtime?.itemCooldowns ?? [],
  };
}

function dayStartFor(date, settings) {
  return new Date(`${date}T${settings.dayStart}:00+08:00`);
}

function blockKey(alarm) {
  const block = alarm?.nextBlock ?? alarm?.endingBlock ?? alarm;
  if (!block) return null;
  return [
    block.itemId ?? block.label,
    new Date(block.start).toISOString(),
    new Date(block.end).toISOString(),
  ].join('|');
}

function activeItems(store) {
  return store.reminderItems.filter(item => item.active !== false);
}

function persistedEventsForDate(store, date) {
  return store.fixedEvents?.[date] ?? [];
}

function replacePersistedDayEvents(store, date, events) {
  const persistedIds = new Set(persistedEventsForDate(store, date).map(event => event.id));
  return events.filter(event => persistedIds.has(event.id) || event.source !== 'course-import');
}

function normalizeInstant(value, field) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} is invalid`);
  return date;
}

function eventDateKey(start, fallbackDate) {
  return fallbackDate ?? localDateKey(start);
}

function findItemByLabel(store, label) {
  return store.reminderItems.find(item => item.label === label && item.active !== false);
}

function slug(value, fallback = 'item') {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

function archivedOneOffItem(label, durationMinutes, at) {
  const now = new Date(at);
  return {
    id: `one-off-${now.getTime()}-${slug(label)}`,
    label,
    defaultDurationMinutes: durationMinutes,
    active: false,
    importanceScore: 1450,
    confidence: 0,
    lastComparedAt: null,
    lastScheduledAt: null,
    lastTouchedAt: now.toISOString(),
    oneOff: true,
    archivedAt: now.toISOString(),
  };
}

function isUserLockEvent(event) {
  return ['runtime-lock', 'project-pick', 'runtime'].includes(event?.source);
}

function matchesBlockWindow(event, input) {
  const start = input.start ? normalizeInstant(input.start, 'start') : null;
  const end = input.end ? normalizeInstant(input.end, 'end') : null;
  const label = String(input.label ?? '').trim();
  const eventStart = new Date(event.startTime);
  const eventEnd = new Date(event.endTime);
  if (start && eventStart.getTime() !== start.getTime()) return false;
  if (end && eventEnd.getTime() !== end.getTime()) return false;
  if (label && event.label !== label) return false;
  return true;
}

export function buildRuntimeView(store, options = {}) {
  const now = runtimeNow(store, options);
  const date = options.date ?? localDateKey(now);
  const manualEvents = store.fixedEvents?.[date] ?? [];
  const courseEvents = getCourseEventsForDate(store, date);
  const fixedEvents = [...manualEvents, ...courseEvents].sort(
    (a, b) => new Date(a.startTime) - new Date(b.startTime),
  );
  const settings = planSettings(store, date);
  const planStart = options.fromNow ? now : dayStartFor(date, settings);
  const plan = buildDayPlan(fixedEvents, activeItems(store), planStart, settings);
  const preferencePair = choosePreferencePair(activeItems(store), store.comparisonHistory ?? [], now);

  return {
    ...plan,
    now,
    settings,
    reminderItems: store.reminderItems,
    comparisonHistory: store.comparisonHistory ?? [],
    preferencePair,
    courseWeeklySchedule: store.courseWeeklySchedule ?? [],
    timeMode: store.runtime?.timeMode ?? 'real',
    paused: store.runtime?.paused ?? false,
  };
}

function rebuildStoreView(store, now, date = localDateKey(now)) {
  return buildRuntimeView(store, { systemNow: now, date });
}

export function resolvePreferenceInStore(store, input) {
  const now = input.now ? new Date(input.now) : runtimeNow(store);
  const date = input.date ?? localDateKey(now);
  const current = buildRuntimeView(store, { systemNow: now, date });
  const nextPlan = rebuildPlanAfterPreferenceChoice(
    current.fixedEvents,
    current.softFillBlocks,
    activeItems(store),
    store.comparisonHistory ?? [],
    now,
    current.settings,
    input,
  );
  const nextStore = {
    ...clone(store),
    reminderItems: store.reminderItems.map(item => (
      nextPlan.reminderItems.find(next => next.id === item.id) ?? item
    )),
    comparisonHistory: nextPlan.comparisonHistory,
    generatedTables: {
      ...store.generatedTables,
      [date]: nextPlan.softFillBlocks,
    },
  };

  return { store: nextStore, view: rebuildStoreView(nextStore, now, date) };
}

export function addTemporaryEventToStore(store, input) {
  const now = input.now ? new Date(input.now) : runtimeNow(store);
  const date = input.date ?? localDateKey(now);
  const current = buildRuntimeView(store, { systemNow: now, date });
  const nextPlan = rebuildPlanAfterTemporaryEvent(
    current.fixedEvents,
    current.softFillBlocks,
    activeItems(store),
    now,
    current.settings,
    {
      ...input,
      date,
      addedAt: input.addedAt ?? now.toISOString(),
    },
  );
  const nextStore = {
    ...clone(store),
    fixedEvents: {
      ...store.fixedEvents,
      [date]: replacePersistedDayEvents(store, date, nextPlan.fixedEvents),
    },
    generatedTables: {
      ...store.generatedTables,
      [date]: nextPlan.softFillBlocks,
    },
  };

  return { store: nextStore, view: rebuildStoreView(nextStore, now, date) };
}

export function lockBlockInStore(store, input = {}) {
  const now = input.now ? new Date(input.now) : runtimeNow(store);
  const start = normalizeInstant(input.start, 'start');
  const end = normalizeInstant(input.end, 'end');
  const date = eventDateKey(start, input.date);
  const current = buildRuntimeView(store, { systemNow: now, date });
  const event = createLockedBlockEvent({
    ...input,
    start,
    end,
    source: input.source ?? 'runtime-lock',
    lockedAt: input.lockedAt ?? now.toISOString(),
  });
  const nextStore = {
    ...clone(store),
    fixedEvents: {
      ...store.fixedEvents,
      [date]: [
        ...replacePersistedDayEvents(store, date, current.fixedEvents).filter(existing => existing.id !== event.id),
        event,
      ].sort((a, b) => new Date(a.startTime) - new Date(b.startTime)),
    },
  };

  return { store: nextStore, view: rebuildStoreView(nextStore, now, date), changed: true };
}

export function unlockBlockInStore(store, input = {}) {
  const now = input.now ? new Date(input.now) : runtimeNow(store);
  const date = input.date
    ?? (input.start ? eventDateKey(normalizeInstant(input.start, 'start')) : localDateKey(now));
  const persistedEvents = persistedEventsForDate(store, date);
  const nextEvents = persistedEvents.filter(event => {
    if (!isUserLockEvent(event)) return true;
    if (input.eventId) return event.id !== input.eventId;
    return !matchesBlockWindow(event, input);
  });
  const changed = nextEvents.length !== persistedEvents.length;
  if (!changed) return { store, view: rebuildStoreView(store, now, date), changed: false };

  const nextStore = {
    ...clone(store),
    fixedEvents: {
      ...store.fixedEvents,
      [date]: nextEvents,
    },
  };

  return { store: nextStore, view: rebuildStoreView(nextStore, now, date), changed: true };
}

export function replaceBlockProjectInStore(store, input = {}) {
  const now = input.now ? new Date(input.now) : runtimeNow(store);
  const start = normalizeInstant(input.start, 'start');
  const end = normalizeInstant(input.end, 'end');
  const date = eventDateKey(start, input.date);
  const label = String(input.newLabel ?? input.label ?? '').trim();
  if (!label) throw new Error('newLabel is required');

  const durationMinutes = Math.max(1, Math.round((end - start) / 60000));
  const existingItem = input.itemId
    ? store.reminderItems.find(item => item.id === input.itemId)
    : findItemByLabel(store, label);
  const oneOffItem = input.oneOff
    ? archivedOneOffItem(label, durationMinutes, input.at ?? now)
    : null;
  const itemId = input.itemId ?? existingItem?.id ?? oneOffItem?.id ?? null;
  const event = createLockedBlockEvent({
    label,
    itemId,
    start,
    end,
    source: 'project-pick',
    oneOff: input.oneOff === true,
    lockedAt: now.toISOString(),
    metadata: {
      ...(input.metadata ?? {}),
      archivedReminderItemId: oneOffItem?.id ?? null,
      pickedFromItemId: existingItem?.id ?? null,
    },
  });
  const current = buildRuntimeView(store, { systemNow: now, date });
  const nextStore = {
    ...clone(store),
    reminderItems: oneOffItem
      ? [...store.reminderItems.filter(item => item.id !== oneOffItem.id), oneOffItem]
      : store.reminderItems,
    fixedEvents: {
      ...store.fixedEvents,
      [date]: [
        ...replacePersistedDayEvents(store, date, current.fixedEvents).filter(existing => {
          const eventStart = new Date(existing.startTime);
          const eventEnd = new Date(existing.endTime);
          return !(existing.source === 'project-pick' && eventStart < end && eventEnd > start);
        }),
        event,
      ].sort((a, b) => new Date(a.startTime) - new Date(b.startTime)),
    },
  };

  return { store: nextStore, view: rebuildStoreView(nextStore, now, date), changed: true };
}

export function endCurrentBlockEarly(store, input = {}) {
  const now = input.now ? new Date(input.now) : runtimeNow(store);
  const date = input.date ?? localDateKey(now);
  const current = buildRuntimeView(store, { systemNow: now, date });
  const result = moveBlockEndAndReschedule(
    current.softFillBlocks,
    current.fixedEvents,
    activeItems(store),
    now,
    input.move ?? 'now',
    {
      ...current.settings,
      earlyEndCooldownMinutes: input.cooldownMinutes ?? store.settings?.defaultEarlyEndCooldownMinutes ?? 180,
    },
  );
  if (!result) return { store, view: current, changed: false };

  const nextStore = {
    ...clone(store),
    fixedEvents: {
      ...store.fixedEvents,
      [date]: [
        ...current.fixedEvents,
        ...(result.adjustedBlock ? [runtimeEventFromBlock(result.adjustedBlock)] : []),
      ],
    },
    runtime: {
      ...store.runtime,
      itemCooldowns: [
        ...(store.runtime?.itemCooldowns ?? []),
        result.cooldown,
      ],
    },
    generatedTables: {
      ...store.generatedTables,
      [date]: result.subsequentBlocks,
    },
  };

  return { store: nextStore, view: rebuildStoreView(nextStore, now, date), changed: true };
}

export function extendCurrentBlock(store, input = {}) {
  const now = input.now ? new Date(input.now) : runtimeNow(store);
  const date = input.date ?? localDateKey(now);
  const current = buildRuntimeView(store, { systemNow: now, date });
  const result = extendBlockAndReschedule(
    current.softFillBlocks,
    current.fixedEvents,
    activeItems(store),
    now,
    input.extraMinutes ?? 15,
    current.settings,
  );
  if (!result) return { store, view: current, changed: false };

  const nextStore = {
    ...clone(store),
    fixedEvents: {
      ...store.fixedEvents,
      [date]: [
        ...current.fixedEvents,
        runtimeEventFromBlock(result.extendedBlock),
      ],
    },
    generatedTables: {
      ...store.generatedTables,
      [date]: result.subsequentBlocks,
    },
  };

  return { store: nextStore, view: rebuildStoreView(nextStore, now, date), changed: true };
}

export function addBreakToStore(store, input = {}) {
  const now = input.now ? new Date(input.now) : runtimeNow(store);
  const date = input.date ?? localDateKey(now);
  const current = buildRuntimeView(store, { systemNow: now, date });
  const result = addBreakAndReschedule(
    current.softFillBlocks,
    current.fixedEvents,
    activeItems(store),
    now,
    input.minutes ?? 15,
    current.settings,
  );
  if (!result) return { store, view: current, changed: false };

  const runtimeBlocks = [
    result.completedBlock,
    result.breakBlock,
  ].filter(Boolean);
  const nextStore = {
    ...clone(store),
    fixedEvents: {
      ...store.fixedEvents,
      [date]: [
        ...current.fixedEvents,
        ...runtimeBlocks.map(runtimeEventFromBlock),
      ],
    },
    generatedTables: {
      ...store.generatedTables,
      [date]: result.subsequentBlocks,
    },
  };

  return { store: nextStore, view: rebuildStoreView(nextStore, now, date), changed: true };
}

export function shouldTriggerAlarm(store, view, input = {}) {
  if (store.runtime?.paused) return { shouldTrigger: false, alarm: null, reason: 'paused' };
  const now = input.now ? new Date(input.now) : view.now;
  const alarm = getDueAlarm(view.softFillBlocks, now, input.lookbackMs ?? 30000) ?? getNextAlarm(view.softFillBlocks, now);
  if (!alarm) return { shouldTrigger: false, alarm: null, reason: 'none' };
  const key = blockKey(alarm);
  const already = (store.runtime?.alarmLog ?? []).some(entry => entry.key === key);
  return already
    ? { shouldTrigger: false, alarm, reason: 'already-triggered' }
    : { shouldTrigger: new Date(alarm.triggerAt) <= now, alarm, reason: 'due' };
}

export function completeAlarm(store, alarm, input = {}) {
  const key = blockKey(alarm);
  if (!key) return store;
  return {
    ...clone(store),
    runtime: {
      ...store.runtime,
      alarmLog: [
        ...(store.runtime?.alarmLog ?? []).filter(entry => entry.key !== key),
        {
          key,
          action: input.action ?? 'dismiss',
          at: new Date(input.at ?? Date.now()).toISOString(),
        },
      ],
    },
  };
}

function runtimeEventFromBlock(block) {
  return {
    id: `runtime-${block.itemId ?? 'break'}-${new Date(block.start).getTime()}-${new Date(block.end).getTime()}`,
    label: block.label,
    startTime: new Date(block.start).toISOString(),
    endTime: new Date(block.end).toISOString(),
    source: 'runtime',
    runtimeBlock: block,
  };
}
