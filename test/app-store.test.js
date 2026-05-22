import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  addFixedEvent,
  addReminderItem,
  archiveReminderItem,
  ensureAppStore,
  loadAppStore,
  saveAppStore,
  updateSettings,
} from '../src/lib/app-store.js';

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
});
