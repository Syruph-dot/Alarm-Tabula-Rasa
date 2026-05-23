import { mergeHardEvents, calculateFreeIntervals } from './intervals.js';
import { resolvePreferenceChoice } from './preference-sampler.js';
import { isNamePinEvent, rebuildFromNow } from '../prototypes/free-time-engine/engine.mjs';

const DEFAULT_TIMEZONE_SUFFIX = '+08:00';

function assertNonBlank(value, field) {
  if (!String(value ?? '').trim()) throw new Error(`${field} is required`);
}

function assertDuration(durationMinutes) {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error('durationMinutes must be positive');
  }
}

function timeToDate(date, time) {
  if (!/^\d{2}:\d{2}$/.test(time)) throw new Error('time must use HH:mm');
  return new Date(`${date}T${time}:00${DEFAULT_TIMEZONE_SUFFIX}`);
}

function formatTimeForId(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}${m}`;
}

function formatLocalDateTime(date) {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${d}T${h}:${m}:00${DEFAULT_TIMEZONE_SUFFIX}`;
}

function formatEventDateTime(date) {
  const value = date instanceof Date ? date : new Date(date);
  return formatLocalDateTime(value);
}

function slugifyLabel(label) {
  const compact = label.trim().toLowerCase();
  if (compact === '开会') return 'kai-hui';
  return compact
    .normalize('NFKD')
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'event';
}

function dateBounds(date, settings) {
  return {
    dayStart: new Date(`${date}T${settings.dayStart}:00${DEFAULT_TIMEZONE_SUFFIX}`),
    dayEnd: new Date(`${date}T${settings.dayEnd}:00${DEFAULT_TIMEZONE_SUFFIX}`),
  };
}

export function addTemporaryEvent(events, input) {
  const date = input.date;
  const label = String(input.label ?? '').trim();
  assertNonBlank(date, 'date');
  assertNonBlank(label, 'label');
  assertNonBlank(input.startTime, 'startTime');
  assertDuration(input.durationMinutes);

  const start = timeToDate(date, input.startTime);
  const end = new Date(start.getTime() + input.durationMinutes * 60000);
  if (end <= start) throw new Error('temporary event must end after it starts');

  const event = {
    id: `temp-${date}-${slugifyLabel(label)}-${formatTimeForId(start)}-${formatTimeForId(end)}`,
    label,
    startTime: formatLocalDateTime(start),
    endTime: formatLocalDateTime(end),
    source: 'temporary',
    locked: true,
    metadata: {
      addedAt: input.addedAt ?? null,
    },
  };

  return [
    ...events.filter(existing => existing.id !== event.id),
    event,
  ].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
}

export function buildDayPlan(fixedEvents, personalProjects, now, settings) {
  const date = settings.date;
  const { dayStart, dayEnd } = dateBounds(date, settings);
  const hardEvents = fixedEvents.filter(event => !isNamePinEvent(event));
  const merged = mergeHardEvents(hardEvents);
  const freeIntervals = calculateFreeIntervals(merged, dayStart, dayEnd);
  const softFillBlocks = rebuildFromNow(fixedEvents, personalProjects, now, settings);

  return {
    date,
    fixedEvents,
    merged,
    freeIntervals,
    softFillBlocks,
  };
}

export function createLockedBlockEvent(input) {
  const label = String(input.label ?? '').trim();
  assertNonBlank(label, 'label');
  const start = input.start instanceof Date ? input.start : new Date(input.start);
  const end = input.end instanceof Date ? input.end : new Date(input.end);
  if (Number.isNaN(start.getTime())) throw new Error('start is invalid');
  if (Number.isNaN(end.getTime())) throw new Error('end is invalid');
  if (end <= start) throw new Error('locked block must end after it starts');
  const itemId = input.itemId ? String(input.itemId) : null;
  const source = input.source ?? 'runtime-lock';
  const id = input.id ?? `${source}-${formatTimeForId(start)}-${formatTimeForId(end)}-${slugifyLabel(label)}`;
  const runtimeBlock = {
    itemId: itemId ?? `one-off-${start.getTime()}`,
    label,
    start,
    end,
    durationMinutes: (end - start) / 60000,
    score: Number(input.score ?? 0),
    runtimeLocked: true,
    lockedEventId: id,
    lockedEventSource: source,
    ...(input.oneOff ? { oneOff: true } : {}),
  };

  return {
    id,
    label,
    startTime: formatEventDateTime(start),
    endTime: formatEventDateTime(end),
    source,
    locked: true,
    runtimeBlock,
    metadata: {
      ...(input.metadata ?? {}),
      lockedAt: input.lockedAt ?? null,
      oneOff: input.oneOff === true,
      originalItemId: itemId,
    },
  };
}

export function rebuildPlanAfterTemporaryEvent(
  fixedEvents,
  softFillBlocks,
  personalProjects,
  now,
  settings,
  eventInput,
) {
  const fixedEventsWithTemporary = addTemporaryEvent(fixedEvents, eventInput);
  const pastBlocks = softFillBlocks.filter(block => block.end <= now);
  const nextPlan = buildDayPlan(fixedEventsWithTemporary, personalProjects, now, settings);

  return {
    ...nextPlan,
    fixedEvents: fixedEventsWithTemporary,
    softFillBlocks: [...pastBlocks, ...nextPlan.softFillBlocks],
  };
}

export function rebuildPlanAfterPreferenceChoice(
  fixedEvents,
  softFillBlocks,
  personalProjects,
  comparisonHistory,
  now,
  settings,
  choiceInput,
) {
  const preference = resolvePreferenceChoice(personalProjects, comparisonHistory, choiceInput);
  const pastBlocks = softFillBlocks.filter(block => block.end <= now);
  const nextPlan = buildDayPlan(fixedEvents, preference.items, now, settings);

  return {
    ...nextPlan,
    personalProjects: preference.items,
    comparisonHistory: preference.history,
    softFillBlocks: [...pastBlocks, ...nextPlan.softFillBlocks],
  };
}
