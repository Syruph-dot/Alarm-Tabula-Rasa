import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  addFixedEvent,
  addReminderItem,
  adjustFixedEventEnd,
  archiveReminderItem,
  cancelFixedEvent,
  clearAllData,
  ensureAppStore,
  loadAppStore,
  saveAppStore,
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
      assert.ok(store.reminderItems.length > 0);
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
      const changed = updateSettings(addReminderItem(store, {
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
      assert.ok(reloaded.reminderItems.some(item => item.label === 'New task'));
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
    const archived = archiveReminderItem(withEvent, 'task-a');

    assert.notEqual(withEvent, store);
    assert.equal(withEvent.fixedEvents['2026-05-22'][0].startTime, '2026-05-22T08:00:00+08:00');
    assert.equal(withEvent.fixedEvents['2026-05-22'][0].endTime, '2026-05-22T08:45:00+08:00');
    assert.equal(archived.reminderItems[0].active, false);
    assert.ok(archived.reminderItems[0].archivedAt);
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
      reminderItems: [],
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
      reminderItems: [],
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

  it('clearAllData resets fixedEvents, generatedTables, reminderItems, comparisonHistory, and courseWeeklySchedule', () => {
    const store = {
      version: 1,
      fixedEvents: { '2026-05-22': [{ id: 'e1', label: 'Test', source: 'course-import' }] },
      generatedTables: { '2026-05-22': [{ itemId: 'a', label: 'Fill' }] },
      reminderItems: [{ id: 'r1', label: 'Reminder', active: true }],
      comparisonHistory: [{ at: '2026-05-22T10:00:00+08:00', leftItemId: 'a', rightItemId: 'b', choice: 'left' }],
      courseWeeklySchedule: [{ dayOfWeek: 1, label: 'Math', startTime: '09:00', endTime: '10:00' }],
      settings: { dayStart: '08:00', dayEnd: '23:00' },
      runtime: { timeMode: 'real', paused: false, itemCooldowns: [] },
    };

    const cleared = clearAllData(store);

    assert.deepEqual(cleared.fixedEvents, {});
    assert.deepEqual(cleared.generatedTables, {});
    assert.deepEqual(cleared.reminderItems, []);
    assert.deepEqual(cleared.comparisonHistory, []);
    assert.deepEqual(cleared.courseWeeklySchedule, []);
    assert.notEqual(cleared, store);
    assert.equal(cleared.version, 1);
  });
});
