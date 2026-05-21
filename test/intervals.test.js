import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeHardEvents, calculateFreeIntervals } from '../src/lib/intervals.js';

function makeEvent(startTime, endTime, label, source) {
  return { startTime, endTime, label: label ?? '', source: source ?? 'fixed' };
}

function toISO(date) {
  return date instanceof Date ? date.toISOString() : date;
}

describe('mergeHardEvents', () => {
  it('returns empty array for no events', () => {
    assert.deepEqual(mergeHardEvents([]), []);
  });

  it('returns single event as one merged interval', () => {
    const events = [makeEvent('2026-05-22T09:55:00+08:00', '2026-05-22T11:30:00+08:00', '数学', 'class')];
    const result = mergeHardEvents(events);
    assert.equal(result.length, 1);
    assert.equal(toISO(result[0].start), new Date('2026-05-22T09:55:00+08:00').toISOString());
    assert.equal(toISO(result[0].end), new Date('2026-05-22T11:30:00+08:00').toISOString());
    assert.deepEqual(result[0].labels, ['数学']);
    assert.deepEqual(result[0].sources, ['class']);
  });

  it('keeps two non-overlapping events as separate intervals', () => {
    const events = [
      makeEvent('2026-05-22T09:00:00+08:00', '2026-05-22T10:00:00+08:00', 'A', 'class'),
      makeEvent('2026-05-22T11:00:00+08:00', '2026-05-22T12:00:00+08:00', 'B', 'class'),
    ];
    const result = mergeHardEvents(events);
    assert.equal(result.length, 2);
    assert.equal(toISO(result[0].start), new Date('2026-05-22T09:00:00+08:00').toISOString());
    assert.equal(toISO(result[1].start), new Date('2026-05-22T11:00:00+08:00').toISOString());
  });

  it('merges when one event contains another', () => {
    const events = [
      makeEvent('2026-05-22T09:00:00+08:00', '2026-05-22T12:00:00+08:00', 'A', 'class'),
      makeEvent('2026-05-22T10:00:00+08:00', '2026-05-22T11:00:00+08:00', 'B', 'class'),
    ];
    const result = mergeHardEvents(events);
    assert.equal(result.length, 1);
    assert.equal(toISO(result[0].start), new Date('2026-05-22T09:00:00+08:00').toISOString());
    assert.equal(toISO(result[0].end), new Date('2026-05-22T12:00:00+08:00').toISOString());
  });

  it('sorts events by start time regardless of input order', () => {
    const events = [
      makeEvent('2026-05-22T11:00:00+08:00', '2026-05-22T12:00:00+08:00', 'B', 'class'),
      makeEvent('2026-05-22T09:00:00+08:00', '2026-05-22T10:00:00+08:00', 'A', 'class'),
    ];
    const result = mergeHardEvents(events);
    assert.equal(result[0].labels[0], 'A');
    assert.equal(result[1].labels[0], 'B');
  });

  it('merges two overlapping events into one interval', () => {
    const events = [
      makeEvent('2026-05-22T09:00:00+08:00', '2026-05-22T10:30:00+08:00', 'A', 'class'),
      makeEvent('2026-05-22T10:00:00+08:00', '2026-05-22T11:00:00+08:00', 'B', 'class'),
    ];
    const result = mergeHardEvents(events);
    assert.equal(result.length, 1);
    assert.equal(toISO(result[0].start), new Date('2026-05-22T09:00:00+08:00').toISOString());
    assert.equal(toISO(result[0].end), new Date('2026-05-22T11:00:00+08:00').toISOString());
  });
});

describe('calculateFreeIntervals', () => {
  const dayStart = new Date('2026-05-22T08:00:00+08:00');
  const dayEnd = new Date('2026-05-22T23:00:00+08:00');

  it('returns full day as one free interval when there are no events', () => {
    const result = calculateFreeIntervals([], dayStart, dayEnd);
    assert.equal(result.length, 1);
    assert.equal(toISO(result[0].start), toISO(dayStart));
    assert.equal(toISO(result[0].end), toISO(dayEnd));
  });

  it('returns two free intervals when a single event is in the middle of the day', () => {
    const events = [
      { start: new Date('2026-05-22T10:00:00+08:00'), end: new Date('2026-05-22T11:00:00+08:00'), labels: ['A'], sources: ['class'] },
    ];
    const result = calculateFreeIntervals(events, dayStart, dayEnd);
    assert.equal(result.length, 2);
    assert.equal(toISO(result[0].start), toISO(dayStart));
    assert.equal(toISO(result[0].end), toISO(events[0].start));
    assert.equal(toISO(result[1].start), toISO(events[0].end));
    assert.equal(toISO(result[1].end), toISO(dayEnd));
  });

  it('returns one free interval when event starts at dayStart', () => {
    const events = [
      { start: dayStart, end: new Date('2026-05-22T10:00:00+08:00'), labels: ['A'], sources: ['class'] },
    ];
    const result = calculateFreeIntervals(events, dayStart, dayEnd);
    assert.equal(result.length, 1);
    assert.equal(toISO(result[0].start), toISO(events[0].end));
  });

  it('returns one free interval when event ends at dayEnd', () => {
    const events = [
      { start: new Date('2026-05-22T10:00:00+08:00'), end: dayEnd, labels: ['A'], sources: ['class'] },
    ];
    const result = calculateFreeIntervals(events, dayStart, dayEnd);
    assert.equal(result.length, 1);
    assert.equal(toISO(result[0].end), toISO(events[0].start));
  });

  it('returns no free intervals when events fill the entire day', () => {
    const events = [
      { start: dayStart, end: dayEnd, labels: ['A'], sources: ['class'] },
    ];
    const result = calculateFreeIntervals(events, dayStart, dayEnd);
    assert.equal(result.length, 0);
  });

  it('handles multiple non-overlapping events', () => {
    const events = [
      { start: new Date('2026-05-22T09:00:00+08:00'), end: new Date('2026-05-22T10:00:00+08:00'), labels: ['A'], sources: ['class'] },
      { start: new Date('2026-05-22T14:00:00+08:00'), end: new Date('2026-05-22T15:00:00+08:00'), labels: ['B'], sources: ['class'] },
    ];
    const result = calculateFreeIntervals(events, dayStart, dayEnd);
    assert.equal(result.length, 3);
    assert.equal(toISO(result[0].start), toISO(dayStart));
    assert.equal(toISO(result[0].end), toISO(events[0].start));
    assert.equal(toISO(result[1].start), toISO(events[0].end));
    assert.equal(toISO(result[1].end), toISO(events[1].start));
    assert.equal(toISO(result[2].start), toISO(events[1].end));
    assert.equal(toISO(result[2].end), toISO(dayEnd));
  });
});
