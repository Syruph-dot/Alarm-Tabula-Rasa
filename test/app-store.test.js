import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  addFixedEvent,
  addPersonalProject,
  adjustFixedEventEnd,
  archivePersonalProject,
  archiveReminder,
  cancelFixedEvent,
  clearAllData,
  createReminder,
  editReminder,
  ensureAppStore,
  listReminders,
  loadAppStore,
  saveAppStore,
  snoozeReminder,
  startReminder,
  updateFixedEventEnd,
  updateSettings,
} from '../src/lib/app-store.js';
import {
  COURSE_TABLE_WEEKLY_SCHEMA_ID,
  importCourseWeeklySchedule,
} from '../src/lib/course-table-import.js';

async function tempDir() {
  const root = join(process.cwd(), '.tmp-tests');
  await mkdir(root, { recursive: true });
  return mkdtemp(join(root, 'tabula-rasa-store-'));
}

describe('app store', () => {
  it('initializes a persisted user store from sample data', async () => {
    const dir = await tempDir();
    try {
      const storePath = join(dir, 'data.json');
      const store = await ensureAppStore({
        userDataPath: dir,
        samplePath: './docs/sample-data/free-time-sample-2026-05-22.json',
      });

      assert.equal(store.version, 1);
      assert.equal(store.runtime.timeMode, 'real');
      assert.equal(store.runtime.paused, false);
      assert.ok(store.fixedEvents['2026-05-22'].length > 0);
      assert.ok(store.personalProjects.length > 0);
      assert.deepEqual(JSON.parse(await readFile(storePath, 'utf-8')).version, 1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('saves and reloads edits without falling back to the sample', async () => {
    const dir = await tempDir();
    try {
      const store = await ensureAppStore({
        userDataPath: dir,
        samplePath: './docs/sample-data/free-time-sample-2026-05-22.json',
      });
      const changed = updateSettings(addPersonalProject(store, {
        label: 'New task',
        defaultDurationMinutes: 25,
      }), {
        timeMode: 'mock',
        mockNow: '2026-05-22T12:34:00+08:00',
        defaultEarlyEndCooldownMinutes: 90,
      });

      await saveAppStore(join(dir, 'data.json'), changed);
      const reloaded = await loadAppStore(join(dir, 'data.json'));

      assert.equal(reloaded.runtime.timeMode, 'mock');
      assert.equal(reloaded.runtime.mockNow, '2026-05-22T12:34:00+08:00');
      assert.equal(reloaded.settings.defaultEarlyEndCooldownMinutes, 90);
      assert.equal(reloaded.settings.transitionEffectId, 'base.black-sweep');
      assert.equal(reloaded.settings.transitionTriangleSizePx, 112);
      assert.equal(reloaded.settings.transitionTiltDeg, -12);
      assert.ok(reloaded.personalProjects.some(item => item.label === 'New task'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('adds fixed events and archives reminder items immutably', async () => {
    const store = {
      version: 1,
      fixedEvents: {},
      reminderItems: [
        { id: 'task-a', label: 'Task A', active: true, importanceScore: 1500 },
      ],
      comparisonHistory: [],
      generatedTables: {},
      settings: { defaultReminderDurationMinutes: 30 },
      runtime: { timeMode: 'real', paused: false, itemCooldowns: [] },
    };

    const withEvent = addFixedEvent(store, {
      date: '2026-05-22',
      label: 'Class',
      source: 'class',
      startTime: '08:00',
      durationMinutes: 45,
    });
    const archived = archivePersonalProject(withEvent, 'task-a');

    assert.notEqual(withEvent, store);
    assert.equal(withEvent.fixedEvents['2026-05-22'][0].startTime, '2026-05-22T08:00:00+08:00');
    assert.equal(withEvent.fixedEvents['2026-05-22'][0].endTime, '2026-05-22T08:45:00+08:00');
    assert.equal(archived.personalProjects[0].active, false);
    assert.ok(archived.personalProjects[0].archivedAt);
  });

  it('updates fixed event end time and cancels fixed events immutably', () => {
    const store = {
      version: 1,
      fixedEvents: {
        '2026-05-22': [
          {
            id: 'class-1',
            label: 'Class',
            startTime: '2026-05-22T10:00:00+08:00',
            endTime: '2026-05-22T11:00:00+08:00',
            source: 'course-import',
            metadata: {},
          },
          {
            id: 'meeting-1',
            label: 'Meeting',
            startTime: '2026-05-22T12:00:00+08:00',
            endTime: '2026-05-22T12:30:00+08:00',
            source: 'fixed',
            metadata: {},
          },
        ],
      },
      personalProjects: [],
      comparisonHistory: [],
      generatedTables: {},
      settings: {},
      runtime: { timeMode: 'real', paused: false, itemCooldowns: [] },
    };

    const ended = updateFixedEventEnd(store, {
      eventId: 'class-1',
      endTime: new Date('2026-05-22T10:25:00+08:00'),
    });
    const cancelled = cancelFixedEvent(ended, 'class-1');

    assert.notEqual(ended, store);
    assert.equal(
      ended.fixedEvents['2026-05-22'].find(event => event.id === 'class-1').endTime,
      '2026-05-22T10:25:00+08:00',
    );
    assert.equal(store.fixedEvents['2026-05-22'][0].endTime, '2026-05-22T11:00:00+08:00');
    assert.equal(cancelled.fixedEvents['2026-05-22'].some(event => event.id === 'class-1'), false);
    assert.equal(cancelled.fixedEvents['2026-05-22'].some(event => event.id === 'meeting-1'), true);
  });

  it('moves fixed event end time by 15 minutes without moving it before now', () => {
    const store = {
      version: 1,
      fixedEvents: {
        '2026-05-22': [
          {
            id: 'class-1',
            label: 'Class',
            startTime: '2026-05-22T10:00:00+08:00',
            endTime: '2026-05-22T11:00:00+08:00',
            source: 'course-import',
          },
        ],
      },
      personalProjects: [],
      comparisonHistory: [],
      generatedTables: {},
      settings: {},
      runtime: { timeMode: 'real', paused: false, itemCooldowns: [] },
    };

    const extended = adjustFixedEventEnd(store, {
      eventId: 'class-1',
      deltaMinutes: 15,
      now: new Date('2026-05-22T10:15:00+08:00'),
    });
    const shortened = adjustFixedEventEnd(extended, {
      eventId: 'class-1',
      deltaMinutes: -15,
      now: new Date('2026-05-22T11:10:00+08:00'),
    });

    assert.equal(
      extended.fixedEvents['2026-05-22'][0].endTime,
      '2026-05-22T11:15:00+08:00',
    );
    assert.equal(
      shortened.fixedEvents['2026-05-22'][0].endTime,
      '2026-05-22T11:10:00+08:00',
    );
  });

  it('persists imported weekly course schedule through the app store', async () => {
    const dir = await tempDir();
    try {
      const storePath = join(dir, 'data.json');
      const store = await ensureAppStore({
        userDataPath: dir,
        samplePath: './docs/sample-data/free-time-sample-2026-05-22.json',
      });
      const imported = importCourseWeeklySchedule(store, JSON.stringify({
        schema: COURSE_TABLE_WEEKLY_SCHEMA_ID,
        timezone: '+08:00',
        events: [
          {
            dayOfWeek: 3,
            title: '信号与系统',
            startTime: '13:30',
            endTime: '15:05',
            location: 'A101',
          },
        ],
      })).store;

      await saveAppStore(storePath, imported);
      const reloaded = await loadAppStore(storePath);

      assert.ok(reloaded.courseWeeklySchedule.some(entry => (
        entry.dayOfWeek === 3
        && entry.label === '信号与系统 @ A101'
      )));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('clearAllData resets fixedEvents, generatedTables, personalProjects, comparisonHistory, and courseWeeklySchedule', () => {
    const store = {
      version: 1,
      fixedEvents: { '2026-05-22': [{ id: 'e1', label: 'Test', source: 'course-import' }] },
      generatedTables: { '2026-05-22': [{ itemId: 'a', label: 'Fill' }] },
      personalProjects: [{ id: 'r1', label: 'Reminder', active: true }],
      comparisonHistory: [{ at: '2026-05-22T10:00:00+08:00', leftItemId: 'a', rightItemId: 'b', choice: 'left' }],
      courseWeeklySchedule: [{ dayOfWeek: 1, label: 'Math', startTime: '09:00', endTime: '10:00' }],
      settings: { dayStart: '08:00', dayEnd: '23:00' },
      runtime: { timeMode: 'real', paused: false, itemCooldowns: [] },
    };

    const cleared = clearAllData(store);

    assert.deepEqual(cleared.fixedEvents, {});
    assert.deepEqual(cleared.generatedTables, {});
    assert.deepEqual(cleared.personalProjects, []);
    assert.deepEqual(cleared.comparisonHistory, []);
    assert.deepEqual(cleared.courseWeeklySchedule, []);
    assert.notEqual(cleared, store);
    assert.equal(cleared.version, 1);
  });

  it('normalizes transition effect settings from updates', () => {
    const store = {
      version: 1,
      fixedEvents: {},
      personalProjects: [],
      comparisonHistory: [],
      generatedTables: {},
      settings: {},
      runtime: { timeMode: 'real', paused: false, itemCooldowns: [] },
    };

    const updated = updateSettings(store, {
      transitionEffectId: 'blue-archive.sweep-1',
      transitionTriangleSizePx: '88',
      transitionTiltDeg: '-21',
    });

    assert.equal(updated.settings.transitionEffectId, 'blue-archive.sweep-1');
    assert.equal(updated.settings.transitionTriangleSizePx, 88);
    assert.equal(updated.settings.transitionTiltDeg, -21);
  });

  it('creates a reminder and persists title, dueAt, and default fields', () => {
    const store = {
      version: 1,
      fixedEvents: {},
      personalProjects: [],
      reminders: [],
      comparisonHistory: [],
      generatedTables: {},
      settings: {},
      runtime: { timeMode: 'real', paused: false, itemCooldowns: [] },
    };

    const result = createReminder(store, {
      title: 'Test reminder',
      dueAt: '2026-05-24T14:00:00+08:00',
    });

    assert.equal(result.reminders.length, 1);
    assert.equal(result.reminders[0].title, 'Test reminder');
    assert.equal(result.reminders[0].dueAt, '2026-05-24T14:00:00+08:00');
    assert.equal(result.reminders[0].status, 'scheduled');
    assert.equal(result.reminders[0].archivedAt, null);
    assert.equal(result.reminders[0].closeCount, 0);
    assert.deepEqual(result.reminders[0].snoozeHistory, []);
    assert.ok(result.reminders[0].id);
    assert.ok(result.reminders[0].createdAt);
    assert.ok(result.reminders[0].updatedAt);
  });

  it('validates title and dueAt are required for creation', () => {
    const store = {
      version: 1,
      fixedEvents: {},
      personalProjects: [],
      reminders: [],
      comparisonHistory: [],
      generatedTables: {},
      settings: {},
      runtime: { timeMode: 'real', paused: false, itemCooldowns: [] },
    };

    assert.throws(() => createReminder(store, { dueAt: '2026-05-24T14:00:00+08:00' }), /title/);
    assert.throws(() => createReminder(store, { title: 'Test' }), /dueAt/);
  });

  it('snoozes a reminder: updates dueAt, status, and appends to snoozeHistory', () => {
    const store = {
      version: 1,
      fixedEvents: {},
      personalProjects: [],
      reminders: [
        { id: 'rem-1', title: 'Test', dueAt: '2026-05-24T14:00:00+08:00', status: 'scheduled', createdAt: '2026-05-24T13:00:00+08:00', updatedAt: '2026-05-24T13:00:00+08:00', archivedAt: null, snoozeHistory: [], closeCount: 0 },
      ],
      comparisonHistory: [],
      generatedTables: {},
      settings: {},
      runtime: { timeMode: 'real', paused: false, itemCooldowns: [] },
    };

    const result = snoozeReminder(store, {
      id: 'rem-1',
      newDueAt: '2026-05-24T14:15:00+08:00',
    });

    assert.equal(result.reminders[0].dueAt, '2026-05-24T14:15:00+08:00');
    assert.equal(result.reminders[0].status, 'snoozed');
    assert.equal(result.reminders[0].snoozeHistory.length, 1);
    assert.equal(result.reminders[0].snoozeHistory[0].from, '2026-05-24T14:00:00+08:00');
    assert.equal(result.reminders[0].snoozeHistory[0].to, '2026-05-24T14:15:00+08:00');
  });

  it('starts a reminder: sets status to started and resets closeCount', () => {
    const store = {
      version: 1,
      fixedEvents: {},
      personalProjects: [],
      reminders: [
        { id: 'rem-1', title: 'Test', dueAt: '2026-05-24T14:00:00+08:00', status: 'scheduled', createdAt: '2026-05-24T13:00:00+08:00', updatedAt: '2026-05-24T13:00:00+08:00', archivedAt: null, snoozeHistory: [], closeCount: 3 },
      ],
      comparisonHistory: [],
      generatedTables: {},
      settings: {},
      runtime: { timeMode: 'real', paused: false, itemCooldowns: [] },
    };

    const result = startReminder(store, { id: 'rem-1' });

    assert.equal(result.reminders[0].status, 'started');
    assert.equal(result.reminders[0].closeCount, 0);
  });

  it('archives a reminder: sets archivedAt, keeps status intact', () => {
    const store = {
      version: 1,
      fixedEvents: {},
      personalProjects: [],
      reminders: [
        { id: 'rem-1', title: 'Test', dueAt: '2026-05-24T14:00:00+08:00', status: 'scheduled', createdAt: '2026-05-24T13:00:00+08:00', updatedAt: '2026-05-24T13:00:00+08:00', archivedAt: null, snoozeHistory: [], closeCount: 0 },
      ],
      comparisonHistory: [],
      generatedTables: {},
      settings: {},
      runtime: { timeMode: 'real', paused: false, itemCooldowns: [] },
    };

    const result = archiveReminder(store, { id: 'rem-1' });

    assert.ok(result.reminders[0].archivedAt);
    assert.equal(result.reminders[0].status, 'scheduled');
  });

  it('edits a reminder: updates title and/or dueAt', () => {
    const store = {
      version: 1,
      fixedEvents: {},
      personalProjects: [],
      reminders: [
        { id: 'rem-1', title: 'Old title', dueAt: '2026-05-24T14:00:00+08:00', status: 'scheduled', createdAt: '2026-05-24T13:00:00+08:00', updatedAt: '2026-05-24T13:00:00+08:00', archivedAt: null, snoozeHistory: [], closeCount: 0 },
      ],
      comparisonHistory: [],
      generatedTables: {},
      settings: {},
      runtime: { timeMode: 'real', paused: false, itemCooldowns: [] },
    };

    const titleOnly = editReminder(store, { id: 'rem-1', title: 'New title' });
    assert.equal(titleOnly.reminders[0].title, 'New title');
    assert.equal(titleOnly.reminders[0].dueAt, '2026-05-24T14:00:00+08:00');

    const dueOnly = editReminder(store, { id: 'rem-1', dueAt: '2026-05-25T10:00:00+08:00' });
    assert.equal(dueOnly.reminders[0].title, 'Old title');
    assert.equal(dueOnly.reminders[0].dueAt, '2026-05-25T10:00:00+08:00');
  });

  it('lists non-archived reminders sorted by dueAt then createdAt', () => {
    const store = {
      version: 1,
      fixedEvents: {},
      personalProjects: [],
      reminders: [
        { id: 'rem-1', title: 'Later', dueAt: '2026-05-24T15:00:00+08:00', status: 'scheduled', createdAt: '2026-05-24T13:00:00+08:00', updatedAt: '2026-05-24T13:00:00+08:00', archivedAt: null, snoozeHistory: [], closeCount: 0 },
        { id: 'rem-2', title: 'Earlier', dueAt: '2026-05-24T14:00:00+08:00', status: 'scheduled', createdAt: '2026-05-24T13:00:00+08:00', updatedAt: '2026-05-24T13:00:00+08:00', archivedAt: null, snoozeHistory: [], closeCount: 0 },
        { id: 'rem-3', title: 'Archived', dueAt: '2026-05-24T12:00:00+08:00', status: 'scheduled', createdAt: '2026-05-24T13:00:00+08:00', updatedAt: '2026-05-24T13:00:00+08:00', archivedAt: '2026-05-24T13:30:00+08:00', snoozeHistory: [], closeCount: 0 },
      ],
      comparisonHistory: [],
      generatedTables: {},
      settings: {},
      runtime: { timeMode: 'real', paused: false, itemCooldowns: [] },
    };

    const active = listReminders(store);
    assert.equal(active.length, 2);
    assert.equal(active[0].id, 'rem-2');
    assert.equal(active[1].id, 'rem-1');

    const all = listReminders(store, { includeArchived: true });
    assert.equal(all.length, 3);
  });

  it('normalizes store with missing reminders key to empty array', async () => {
    const dir = await tempDir();
    try {
      const storePath = join(dir, 'data.json');
      const store = await ensureAppStore({
        userDataPath: dir,
        samplePath: './docs/sample-data/free-time-sample-2026-05-22.json',
      });

      assert.deepEqual(store.reminders, []);
      assert.equal(Array.isArray(store.reminders), true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
