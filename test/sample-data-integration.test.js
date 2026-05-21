import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeHardEvents, calculateFreeIntervals } from '../src/lib/intervals.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const samplePath = resolve(__dirname, '..', 'docs', 'sample-data', 'free-time-sample-2026-05-22.json');

function toISO(date) {
  return date instanceof Date ? date.toISOString() : date;
}

describe('sample data integration', () => {
  let data;
  let merged;
  let free;

  before(() => {
    data = JSON.parse(readFileSync(samplePath, 'utf-8'));
    const date = data.metadata.date;
    const events = data.fixedEvents[date];
    merged = mergeHardEvents(events);
    const dayStart = new Date(`${date}T${data.settings.dayStart}:00+08:00`);
    const dayEnd = new Date(`${date}T${data.settings.dayEnd}:00+08:00`);
    free = calculateFreeIntervals(merged, dayStart, dayEnd);
  });

  it('loads sample data with 4 fixed events', () => {
    assert.equal(Object.keys(data.fixedEvents).length, 1);
    assert.equal(data.fixedEvents['2026-05-22'].length, 4);
  });

  it('merges into 4 non-overlapping hard intervals (no overlaps in sample)', () => {
    assert.equal(merged.length, 4);
    assert.equal(merged[0].labels[0], '开会');
    assert.equal(merged[1].labels[0], '高等数学Ⅱ');
    assert.equal(merged[2].labels[0], '思想道德与法治');
    assert.equal(merged[3].labels[0], '电路分析Ⅰ');
  });

  it('produces 4 free intervals around the hard events', () => {
    assert.equal(free.length, 4);
    assert.equal(toISO(free[0].start), new Date('2026-05-22T09:00:00+08:00').toISOString());
    assert.equal(toISO(free[0].end), new Date('2026-05-22T09:55:00+08:00').toISOString());
    assert.equal(toISO(free[1].start), new Date('2026-05-22T11:30:00+08:00').toISOString());
    assert.equal(toISO(free[1].end), new Date('2026-05-22T15:25:00+08:00').toISOString());
    assert.equal(toISO(free[2].start), new Date('2026-05-22T17:50:00+08:00').toISOString());
    assert.equal(toISO(free[2].end), new Date('2026-05-22T19:20:00+08:00').toISOString());
    assert.equal(toISO(free[3].start), new Date('2026-05-22T21:45:00+08:00').toISOString());
    assert.equal(toISO(free[3].end), new Date('2026-05-22T23:00:00+08:00').toISOString());
  });
});
