import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  choosePreferencePair,
  resolvePreferenceChoice,
} from '../src/lib/preference-sampler.js';
import { rebuildPlanAfterPreferenceChoice } from '../src/lib/day-planner.js';

const now = new Date('2026-05-22T12:00:00+08:00');

function items() {
  return [
    { id: 'a', label: '项目 A', active: true, importanceScore: 1500, confidence: 0.2, lastScheduledAt: null },
    { id: 'b', label: '项目 B', active: true, importanceScore: 1500, confidence: 0.2, lastScheduledAt: null },
    { id: 'c', label: '项目 C', active: true, importanceScore: 1300, confidence: 0.9, lastScheduledAt: '2026-05-22T11:50:00+08:00' },
  ];
}

function byId(collection, id) {
  return collection.find(item => item.id === id);
}

describe('preference sampler', () => {
  it('uses the first-impression prompt', () => {
    const pair = choosePreferencePair(items(), [], now);

    assert.ok(pair);
    assert.equal(pair.prompt, '第一印象：哪个更重要？');
  });

  it('left and right choices update scores in opposite directions and append history', () => {
    const leftResult = resolvePreferenceChoice(items(), [], {
      leftItemId: 'a',
      rightItemId: 'b',
      choice: 'left',
      at: now,
    });
    const rightResult = resolvePreferenceChoice(items(), [], {
      leftItemId: 'a',
      rightItemId: 'b',
      choice: 'right',
      at: now,
    });

    assert.ok(byId(leftResult.items, 'a').importanceScore > byId(items(), 'a').importanceScore);
    assert.ok(byId(leftResult.items, 'b').importanceScore < byId(items(), 'b').importanceScore);
    assert.ok(byId(rightResult.items, 'a').importanceScore < byId(items(), 'a').importanceScore);
    assert.ok(byId(rightResult.items, 'b').importanceScore > byId(items(), 'b').importanceScore);
    assert.equal(leftResult.history.length, 1);
    assert.equal(leftResult.history[0].prompt, '第一印象：哪个更重要？');
  });

  it('tie moves scores closer and increases confidence', () => {
    const start = [
      { id: 'a', label: '项目 A', active: true, importanceScore: 1600, confidence: 0.2 },
      { id: 'b', label: '项目 B', active: true, importanceScore: 1400, confidence: 0.2 },
    ];
    const result = resolvePreferenceChoice(start, [], {
      leftItemId: 'a',
      rightItemId: 'b',
      choice: 'tie',
      at: now,
    });

    assert.ok(Math.abs(byId(result.items, 'a').importanceScore - byId(result.items, 'b').importanceScore) < 200);
    assert.ok(byId(result.items, 'a').confidence > 0.2);
    assert.ok(byId(result.items, 'b').confidence > 0.2);
  });

  it('skip does not change scores and reduces short-term repeat of that pair', () => {
    const result = resolvePreferenceChoice(items(), [], {
      leftItemId: 'a',
      rightItemId: 'b',
      choice: 'skip',
      at: now,
    });
    const pair = choosePreferencePair(result.items, result.history, new Date('2026-05-22T12:01:00+08:00'));

    assert.deepEqual(result.items, items());
    assert.equal(result.history[0].choice, 'skip');
    assert.notDeepEqual([pair.left.id, pair.right.id].sort(), ['a', 'b']);
  });

  it('prefers close, under-covered, active, unscheduled items', () => {
    const sampleItems = [
      { id: 'a', label: 'A', active: true, importanceScore: 1500, confidence: 0.2, lastScheduledAt: null },
      { id: 'b', label: 'B', active: true, importanceScore: 1490, confidence: 0.2, lastScheduledAt: null },
      { id: 'c', label: 'C', active: true, importanceScore: 1100, confidence: 0.9, lastScheduledAt: '2026-05-22T11:55:00+08:00' },
      { id: 'd', label: 'D', active: false, importanceScore: 1500, confidence: 0.1, lastScheduledAt: null },
    ];
    const history = [
      { at: '2026-05-22T10:00:00+08:00', leftItemId: 'c', rightItemId: 'a', choice: 'left' },
      { at: '2026-05-22T10:10:00+08:00', leftItemId: 'c', rightItemId: 'b', choice: 'right' },
    ];

    const pair = choosePreferencePair(sampleItems, history, now);

    assert.ok(pair);
    assert.deepEqual([pair.left.id, pair.right.id].sort(), ['a', 'b']);
  });

  it('can rebuild future soft-fill blocks after a comparison', () => {
    const fixedEvents = [];
    const settings = {
      date: '2026-05-22',
      dayStart: '12:00',
      dayEnd: '13:00',
      minimumFillMinutes: 15,
    };
    const startItems = [
      { id: 'a', label: '项目 A', active: true, importanceScore: 1500, confidence: 0.2, defaultDurationMinutes: 30 },
      { id: 'b', label: '项目 B', active: true, importanceScore: 1500, confidence: 0.2, defaultDurationMinutes: 30 },
    ];

    const result = rebuildPlanAfterPreferenceChoice(
      fixedEvents,
      [],
      startItems,
      [],
      now,
      settings,
      {
        leftItemId: 'a',
        rightItemId: 'b',
        choice: 'right',
        at: now,
      },
    );

    assert.equal(result.comparisonHistory.length, 1);
    assert.equal(result.softFillBlocks[0].itemId, 'b');
    assert.ok(byId(result.reminderItems, 'b').importanceScore > byId(result.reminderItems, 'a').importanceScore);
  });
});
