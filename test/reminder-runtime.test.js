import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkDueReminders,
  computeCloseSnoozeMinutes,
  computeSnoozeDueAt,
  getSnoozePresets,
} from '../src/lib/reminder-runtime.js';
import { startReminderFlow } from '../src/lib/app-runtime.js';
import { createReminder } from '../src/lib/app-store.js';

function baseStore() {
  return {
    version: 1,
    fixedEvents: {
      '2026-05-24': [
        {
          id: 'course-1',
          label: 'Math',
          startTime: '2026-05-24T10:00:00+08:00',
          endTime: '2026-05-24T11:30:00+08:00',
          source: 'course-import',
        },
      ],
    },
    personalProjects: [
      { id: 'a', label: 'Task A', active: true, defaultDurationMinutes: 30, importanceScore: 1500, confidence: 0.2 },
    ],
    reminders: [
      {
        id: 'rem-future',
        title: 'Future reminder',
        dueAt: '2026-05-24T15:00:00+08:00',
        status: 'scheduled',
        createdAt: '2026-05-24T10:00:00+08:00',
        updatedAt: '2026-05-24T10:00:00+08:00',
        archivedAt: null,
        snoozeHistory: [],
        closeCount: 0,
      },
      {
        id: 'rem-due-now',
        title: 'Due now',
        dueAt: '2026-05-24T12:00:00+08:00',
        status: 'scheduled',
        createdAt: '2026-05-24T10:00:00+08:00',
        updatedAt: '2026-05-24T10:00:00+08:00',
        archivedAt: null,
        snoozeHistory: [],
        closeCount: 0,
      },
      {
        id: 'rem-overdue',
        title: 'Overdue',
        dueAt: '2026-05-24T11:00:00+08:00',
        status: 'scheduled',
        createdAt: '2026-05-24T09:00:00+08:00',
        updatedAt: '2026-05-24T09:00:00+08:00',
        archivedAt: null,
        snoozeHistory: [],
        closeCount: 0,
      },
      {
        id: 'rem-snoozed',
        title: 'Snoozed due',
        dueAt: '2026-05-24T12:00:00+08:00',
        status: 'snoozed',
        createdAt: '2026-05-24T10:00:00+08:00',
        updatedAt: '2026-05-24T11:00:00+08:00',
        archivedAt: null,
        snoozeHistory: [],
        closeCount: 0,
      },
      {
        id: 'rem-started',
        title: 'Started',
        dueAt: '2026-05-24T12:00:00+08:00',
        status: 'started',
        createdAt: '2026-05-24T10:00:00+08:00',
        updatedAt: '2026-05-24T10:30:00+08:00',
        archivedAt: null,
        snoozeHistory: [],
        closeCount: 0,
      },
      {
        id: 'rem-archived',
        title: 'Archived',
        dueAt: '2026-05-24T12:00:00+08:00',
        status: 'scheduled',
        createdAt: '2026-05-24T10:00:00+08:00',
        updatedAt: '2026-05-24T10:00:00+08:00',
        archivedAt: '2026-05-24T11:00:00+08:00',
        snoozeHistory: [],
        closeCount: 0,
      },
    ],
    comparisonHistory: [],
    generatedTables: {},
    settings: {
      dayStart: '08:00',
      dayEnd: '23:00',
      minimumFillMinutes: 15,
      alarmSeconds: 10,
      defaultEarlyEndCooldownMinutes: 180,
    },
    runtime: {
      timeMode: 'real',
      mockNow: '2026-05-24T12:00:00+08:00',
      paused: false,
      itemCooldowns: [],
      alarmLog: [],
    },
  };
}

const NOW = new Date('2026-05-24T12:00:00+08:00');

describe('reminder runtime', () => {
  it('detects due reminders filtering by status and time', () => {
    // Due: due-now (dueAt 12:00, now 12:00, status scheduled)
    // Overdue: overdue (dueAt 11:00, status scheduled, lookback covers 11:00-12:00)
    // Snoozed: due-now dueAt + snoozed status
    // Excluded: started status, archived, future dueAt
    const due = checkDueReminders(baseStore(), NOW, 3600000);

    assert.ok(due.some(r => r.id === 'rem-due-now'));
    assert.ok(due.some(r => r.id === 'rem-overdue'));
    assert.ok(due.some(r => r.id === 'rem-snoozed'));
    assert.equal(due.some(r => r.id === 'rem-started'), false);
    assert.equal(due.some(r => r.id === 'rem-archived'), false);
    assert.equal(due.some(r => r.id === 'rem-future'), false);
  });

  it('detects overdue reminders beyond lookback when past the window', () => {
    const due = checkDueReminders(baseStore(), NOW, 60000);
    // 60000ms lookback = 11:59-12:00. Overdue at 11:00 is outside
    assert.equal(due.some(r => r.id === 'rem-overdue'), false);
    assert.ok(due.some(r => r.id === 'rem-due-now'));
  });

  it('orders multiple due reminders by dueAt then createdAt', () => {
    const due = checkDueReminders(baseStore(), NOW, 3600000);

    assert.equal(due.length, 3);
    assert.equal(due[0].id, 'rem-overdue');
    assert.equal(due[1].id, 'rem-due-now');
    assert.equal(due[2].id, 'rem-snoozed');
  });

  it('returns empty array when no reminders are due', () => {
    const store = baseStore();
    store.reminders = [];
    assert.deepEqual(checkDueReminders(store, NOW), []);
  });

  it('provides snooze presets', () => {
    assert.deepEqual(getSnoozePresets(), [5, 10, 15, 30, 60]);
  });

  it('computes snooze dueAt from now and preset minutes', () => {
    const result = computeSnoozeDueAt(NOW, 15);
    assert.equal(result.getTime(), NOW.getTime() + 15 * 60000);
  });

  it('computes close-button snooze minutes from closeCount', () => {
    assert.equal(computeCloseSnoozeMinutes({ closeCount: 0 }), 12);
    assert.equal(computeCloseSnoozeMinutes({ closeCount: 1 }), 17);
    assert.equal(computeCloseSnoozeMinutes({ closeCount: 2 }), 22);
    assert.equal(computeCloseSnoozeMinutes({ closeCount: 5 }), 37);
  });

  it('start flow inserts one-off block and marks reminder started', () => {
    const store = createReminder(baseStore(), {
      title: 'Test reminder',
      dueAt: '2026-05-24T12:05:00+08:00',
    });
    const reminder = store.reminders.find(r => r.title === 'Test reminder');

    const result = startReminderFlow(store, {
      now: NOW,
      date: '2026-05-24',
      reminderId: reminder.id,
      durationMinutes: 30,
      label: 'Test reminder',
    });

    assert.equal(result.changed, true);

    // Reminder marked as started
    const updated = result.store.reminders.find(r => r.id === reminder.id);
    assert.equal(updated.status, 'started');

    // One-off block inserted
    const inserted = result.store.fixedEvents['2026-05-24'].some(event => (
      event.source === 'reminder-start'
      && event.label === 'Test reminder'
    ));
    assert.ok(inserted);
  });

  it('start flow caps duration before next course', () => {
    const store = createReminder(baseStore(), {
      title: 'Long reminder',
      dueAt: '2026-05-24T12:05:00+08:00',
    });
    const reminder = store.reminders.find(r => r.title === 'Long reminder');

    // now=12:00, next course ends at 11:30 → next non-runtime after now is... none
    // There's only one course event at 10:00-11:30, so capEnd would be undefined
    // 30 minutes from 12:00 = 12:30, no cap, block should be 12:00-12:30
    const noCap = startReminderFlow(store, {
      now: NOW,
      date: '2026-05-24',
      reminderId: reminder.id,
      durationMinutes: 30,
      label: 'Long reminder',
    });

    const block = noCap.store.fixedEvents['2026-05-24'].find(e => e.source === 'reminder-start');
    assert.ok(block);
    const blockStart = new Date(block.startTime);
    const blockEnd = new Date(block.endTime);
    assert.equal(blockStart.getTime(), NOW.getTime());
    assert.equal(blockEnd.getTime(), NOW.getTime() + 30 * 60000);
  });

  it('start flow truncates current block before inserting reminder block', () => {
    // now=12:00, current soft block is Task A from 12:00-12:30 (generated by rebuildFromNow)
    // Start flow should end current block at 12:00 and insert reminder from 12:00
    const store = createReminder(baseStore(), {
      title: 'Interrupt',
      dueAt: '2026-05-24T12:00:00+08:00',
    });
    const reminder = store.reminders.find(r => r.title === 'Interrupt');

    const result = startReminderFlow(store, {
      now: NOW,
      date: '2026-05-24',
      reminderId: reminder.id,
      durationMinutes: 20,
      label: 'Interrupt',
    });

    // Reminder block should exist
    const reminderBlock = result.store.fixedEvents['2026-05-24'].find(e => e.source === 'reminder-start');
    assert.ok(reminderBlock);
    assert.equal(reminderBlock.label, 'Interrupt');
    assert.equal(new Date(reminderBlock.startTime).getTime(), NOW.getTime());

    // Future plan should not schedule Task A during the reminder block window
    const futureBlocks = result.view.softFillBlocks ?? [];
    const overlapping = futureBlocks.filter(b => (
      b.itemId === 'a'
      && b.start < new Date(reminderBlock.endTime)
      && b.end > new Date(reminderBlock.startTime)
    ));
    assert.equal(overlapping.length, 0);
  });

  it('does not create a permanent personal project from started reminder', () => {
    const store = createReminder(baseStore(), {
      title: 'One-off task',
      dueAt: '2026-05-24T12:05:00+08:00',
    });
    const reminder = store.reminders.find(r => r.title === 'One-off task');

    const result = startReminderFlow(store, {
      now: NOW,
      date: '2026-05-24',
      reminderId: reminder.id,
      durationMinutes: 15,
      label: 'One-off task',
    });

    const projects = result.store.personalProjects.filter(p => p.label === 'One-off task');
    assert.equal(projects.length, 0);
  });
});
