import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addBreakToStore,
  addTemporaryEventToStore,
  buildRuntimeView,
  completeAlarm,
  endCurrentBlockEarly,
  extendCurrentBlock,
  resolvePreferenceInStore,
  shouldTriggerAlarm,
} from '../src/lib/app-runtime.js';

function baseStore() {
  return {
    version: 1,
    fixedEvents: {
      '2026-05-22': [
        {
          id: 'class-1',
          label: 'Class',
          startTime: '2026-05-22T10:00:00+08:00',
          endTime: '2026-05-22T11:00:00+08:00',
          source: 'class',
        },
      ],
    },
    reminderItems: [
      { id: 'a', label: 'Task A', active: true, defaultDurationMinutes: 30, importanceScore: 1500, confidence: 0.2 },
      { id: 'b', label: 'Task B', active: true, defaultDurationMinutes: 30, importanceScore: 1400, confidence: 0.2 },
    ],
    comparisonHistory: [],
    generatedTables: {},
    settings: {
      dayStart: '08:00',
      dayEnd: '12:00',
      minimumFillMinutes: 15,
      alarmSeconds: 10,
      defaultEarlyEndCooldownMinutes: 180,
    },
    runtime: {
      timeMode: 'real',
      mockNow: '2026-05-22T08:00:00+08:00',
      paused: false,
      itemCooldowns: [],
      alarmLog: [],
    },
  };
}

describe('app runtime', () => {
  it('uses system time in real mode and mock time in mock mode', () => {
    const real = buildRuntimeView(baseStore(), {
      systemNow: new Date('2026-05-22T08:05:00+08:00'),
    });
    const mock = buildRuntimeView({
      ...baseStore(),
      runtime: { ...baseStore().runtime, timeMode: 'mock', mockNow: '2026-05-22T09:15:00+08:00' },
    }, {
      systemNow: new Date('2026-05-22T08:05:00+08:00'),
    });

    assert.equal(real.now.toISOString(), new Date('2026-05-22T08:05:00+08:00').toISOString());
    assert.equal(mock.now.toISOString(), new Date('2026-05-22T09:15:00+08:00').toISOString());
  });

  it('persists preference choices and rebuilds future blocks', () => {
    const result = resolvePreferenceInStore(baseStore(), {
      now: new Date('2026-05-22T08:00:00+08:00'),
      leftItemId: 'a',
      rightItemId: 'b',
      choice: 'right',
    });

    assert.equal(result.store.comparisonHistory.length, 1);
    assert.ok(result.store.reminderItems.find(item => item.id === 'b').importanceScore > 1400);
    assert.equal(result.view.softFillBlocks[0].itemId, 'b');
  });

  it('adds temporary events to the persisted day and removes that time from soft fill', () => {
    const result = addTemporaryEventToStore(baseStore(), {
      now: new Date('2026-05-22T08:00:00+08:00'),
      date: '2026-05-22',
      label: 'Meeting',
      startTime: '08:30',
      durationMinutes: 30,
    });

    assert.ok(result.store.fixedEvents['2026-05-22'].some(event => event.source === 'temporary'));
    assert.ok(result.view.softFillBlocks.every(block => (
      block.end <= new Date('2026-05-22T08:30:00+08:00')
      || block.start >= new Date('2026-05-22T09:00:00+08:00')
    )));
  });

  it('early end cools the item down and prevents immediate re-scheduling', () => {
    const result = endCurrentBlockEarly(baseStore(), {
      now: new Date('2026-05-22T08:10:00+08:00'),
      move: 'now',
      cooldownMinutes: 180,
    });

    assert.equal(result.store.runtime.itemCooldowns.length, 1);
    assert.equal(result.store.runtime.itemCooldowns[0].itemId, 'a');
    const nextFuture = result.view.softFillBlocks.find(block => block.start >= new Date('2026-05-22T08:10:00+08:00'));
    assert.notEqual(nextFuture?.itemId, 'a');
  });

  it('extend and requested break write runtime locked blocks into the future plan', () => {
    const extended = extendCurrentBlock(baseStore(), {
      now: new Date('2026-05-22T08:10:00+08:00'),
      extraMinutes: 15,
    });
    const rested = addBreakToStore(baseStore(), {
      now: new Date('2026-05-22T08:10:00+08:00'),
      minutes: 20,
    });

    assert.ok(extended.view.softFillBlocks.some(block => block.extended));
    assert.ok(rested.view.softFillBlocks.some(block => block.break && block.breakReason === 'requested-break'));
  });

  it('triggers each alarm once unless the user completes it', () => {
    const view = buildRuntimeView(baseStore(), {
      systemNow: new Date('2026-05-22T08:30:00+08:00'),
    });
    const first = shouldTriggerAlarm(baseStore(), view, {
      now: new Date('2026-05-22T08:30:00+08:00'),
    });
    const completed = completeAlarm(baseStore(), first.alarm, {
      action: 'dismiss',
      at: new Date('2026-05-22T08:30:05+08:00'),
    });
    const second = shouldTriggerAlarm(completed, view, {
      now: new Date('2026-05-22T08:30:10+08:00'),
    });

    assert.equal(first.shouldTrigger, true);
    assert.equal(completed.runtime.alarmLog.length, 1);
    assert.equal(second.shouldTrigger, false);
  });

  it('still triggers shortly after a block boundary so scheduler polling cannot miss it', () => {
    const view = buildRuntimeView(baseStore(), {
      systemNow: new Date('2026-05-22T08:30:05+08:00'),
    });
    const due = shouldTriggerAlarm(baseStore(), view, {
      now: new Date('2026-05-22T08:30:05+08:00'),
    });

    assert.equal(due.shouldTrigger, true);
    assert.equal(due.alarm.triggerAt.toISOString(), new Date('2026-05-22T08:30:00+08:00').toISOString());
  });
});
