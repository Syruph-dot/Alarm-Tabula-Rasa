import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addTemporaryEvent,
  buildDayPlan,
  rebuildPlanAfterTemporaryEvent,
} from '../src/lib/day-planner.js';

const settings = {
  date: '2026-05-22',
  dayStart: '08:00',
  dayEnd: '23:00',
  minimumFillMinutes: 15,
};

const fixedEvents = [
  {
    id: 'class-math',
    label: '高等数学Ⅱ',
    startTime: '2026-05-22T09:55:00+08:00',
    endTime: '2026-05-22T11:30:00+08:00',
    source: 'class',
  },
  {
    id: 'class-politics',
    label: '思想道德与法治',
    startTime: '2026-05-22T15:25:00+08:00',
    endTime: '2026-05-22T17:50:00+08:00',
    source: 'class',
  },
];

const personalProjects = [
  {
    id: 'item-a',
    label: '项目 A',
    defaultDurationMinutes: 30,
    active: true,
    importanceScore: 1500,
  },
  {
    id: 'item-b',
    label: '项目 B',
    defaultDurationMinutes: 30,
    active: true,
    importanceScore: 1400,
  },
];

function iso(value) {
  return value.toISOString();
}

describe('temporary event insertion', () => {
  it('stores a temporary event with preset duration and exact meeting time', () => {
    const result = addTemporaryEvent([], {
      date: '2026-05-22',
      label: '开会',
      startTime: '08:00',
      durationMinutes: 60,
    });

    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'temp-2026-05-22-kai-hui-0800-0900');
    assert.equal(result[0].label, '开会');
    assert.equal(result[0].source, 'temporary');
    assert.equal(result[0].locked, true);
    assert.equal(result[0].startTime, '2026-05-22T08:00:00+08:00');
    assert.equal(result[0].endTime, '2026-05-22T09:00:00+08:00');
  });

  it('replaces an existing temporary event with the same generated id', () => {
    const first = addTemporaryEvent([], {
      date: '2026-05-22',
      label: '开会',
      startTime: '08:00',
      durationMinutes: 60,
    });
    const second = addTemporaryEvent(first, {
      date: '2026-05-22',
      label: '开会',
      startTime: '08:00',
      durationMinutes: 60,
      addedAt: '2026-05-21T12:00:00+08:00',
    });

    assert.equal(second.length, 1);
    assert.equal(second[0].id, 'temp-2026-05-22-kai-hui-0800-0900');
    assert.equal(second[0].metadata.addedAt, '2026-05-21T12:00:00+08:00');
  });

  it('keeps past soft-fill blocks and regenerates only the future after insertion', () => {
    const now = new Date('2026-05-22T12:00:00+08:00');
    const before = buildDayPlan(fixedEvents, personalProjects, now, settings);
    const pastBlock = {
      itemId: 'past',
      label: '已完成',
      start: new Date('2026-05-22T11:30:00+08:00'),
      end: new Date('2026-05-22T12:00:00+08:00'),
      durationMinutes: 30,
      score: 1200,
    };

    const result = rebuildPlanAfterTemporaryEvent(
      fixedEvents,
      [pastBlock, ...before.softFillBlocks],
      personalProjects,
      now,
      settings,
      {
        date: '2026-05-22',
        label: '开会',
        startTime: '13:00',
        durationMinutes: 60,
      },
    );

    assert.deepEqual(result.softFillBlocks.filter(block => block.end <= now), [pastBlock]);
    assert.ok(result.fixedEvents.some(event => event.source === 'temporary' && event.label === '开会'));
    assert.ok(result.softFillBlocks.every(block => block.end <= now || block.start >= now));
    assert.ok(result.softFillBlocks.filter(block => block.start < new Date('2026-05-22T14:00:00+08:00') && block.end > new Date('2026-05-22T13:00:00+08:00')).every(block => block.end <= new Date('2026-05-22T13:00:00+08:00') || block.start >= new Date('2026-05-22T14:00:00+08:00')));
  });

  it('rebuilds around a temporary event before existing hard intervals', () => {
    const now = new Date('2026-05-22T08:00:00+08:00');
    const result = rebuildPlanAfterTemporaryEvent(
      fixedEvents,
      [],
      personalProjects,
      now,
      settings,
      {
        date: '2026-05-22',
        label: '开会',
        startTime: '08:00',
        durationMinutes: 60,
      },
    );

    assert.equal(iso(result.freeIntervals[0].start), new Date('2026-05-22T09:00:00+08:00').toISOString());
    assert.equal(iso(result.freeIntervals[0].end), new Date('2026-05-22T09:55:00+08:00').toISOString());
  });

  it('rebuilds around a temporary event during an existing hard interval', () => {
    const now = new Date('2026-05-22T08:00:00+08:00');
    const result = rebuildPlanAfterTemporaryEvent(
      fixedEvents,
      [],
      personalProjects,
      now,
      settings,
      {
        date: '2026-05-22',
        label: '临时讨论',
        startTime: '10:30',
        durationMinutes: 30,
      },
    );

    const hard = result.merged.find(interval => interval.labels.includes('高等数学Ⅱ'));
    assert.ok(hard);
    assert.equal(iso(hard.start), new Date('2026-05-22T09:55:00+08:00').toISOString());
    assert.equal(iso(hard.end), new Date('2026-05-22T11:30:00+08:00').toISOString());
    assert.ok(hard.labels.includes('临时讨论'));
  });

  it('rebuilds around a temporary event after existing hard intervals', () => {
    const now = new Date('2026-05-22T18:00:00+08:00');
    const result = rebuildPlanAfterTemporaryEvent(
      fixedEvents,
      [],
      personalProjects,
      now,
      settings,
      {
        date: '2026-05-22',
        label: '开会',
        startTime: '19:00',
        durationMinutes: 60,
      },
    );

    assert.ok(result.fixedEvents.some(event => event.startTime === '2026-05-22T19:00:00+08:00' && event.endTime === '2026-05-22T20:00:00+08:00'));
    assert.ok(result.softFillBlocks.every(block => block.end <= new Date('2026-05-22T19:00:00+08:00') || block.start >= new Date('2026-05-22T20:00:00+08:00')));
  });
});
