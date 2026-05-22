import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearImportedCourseTable,
  COURSE_TABLE_SCHEMA_ID,
  importCourseTableJson,
  parseCourseTableJson,
} from '../src/lib/course-table-import.js';

const store = {
  version: 1,
  fixedEvents: {
    '2026-05-22': [
      {
        id: 'manual-1',
        label: 'Manual meeting',
        startTime: '2026-05-22T08:00:00+08:00',
        endTime: '2026-05-22T09:00:00+08:00',
        source: 'fixed',
      },
      {
        id: 'course-old',
        label: 'Old course',
        startTime: '2026-05-22T09:00:00+08:00',
        endTime: '2026-05-22T10:00:00+08:00',
        source: 'course-import',
      },
    ],
  },
  reminderItems: [],
  comparisonHistory: [],
  generatedTables: {},
  settings: {},
  runtime: {},
};

const validJson = JSON.stringify({
  schema: COURSE_TABLE_SCHEMA_ID,
  timezone: '+08:00',
  events: [
    {
      date: '2026-05-22',
      title: '高等数学',
      startTime: '09:55',
      endTime: '11:30',
      location: '宝山213',
      teacher: '洪老师',
    },
    {
      date: '2026-05-23',
      title: '电路分析',
      startTime: '15:25',
      endTime: '17:50',
    },
  ],
});

describe('course table import', () => {
  it('parses the course table schema into dated time blocks', () => {
    const parsed = parseCourseTableJson(validJson);

    assert.equal(parsed.schema, COURSE_TABLE_SCHEMA_ID);
    assert.equal(parsed.events.length, 2);
    assert.equal(parsed.events[0].label, '高等数学 @ 宝山213');
    assert.equal(parsed.events[0].startTime, '2026-05-22T09:55:00+08:00');
    assert.equal(parsed.events[0].endTime, '2026-05-22T11:30:00+08:00');
    assert.equal(parsed.events[0].source, 'course-import');
  });

  it('imports course blocks by replacing previous course imports while preserving manual time blocks', () => {
    const result = importCourseTableJson(store, validJson);

    assert.equal(result.importedCount, 2);
    assert.equal(result.store.fixedEvents['2026-05-22'].length, 2);
    assert.ok(result.store.fixedEvents['2026-05-22'].some(event => event.id === 'manual-1'));
    assert.ok(result.store.fixedEvents['2026-05-22'].some(event => event.label === '高等数学 @ 宝山213'));
    assert.equal(result.store.fixedEvents['2026-05-22'].some(event => event.id === 'course-old'), false);
    assert.equal(result.store.fixedEvents['2026-05-23'][0].label, '电路分析');
  });

  it('clears only imported course blocks', () => {
    const imported = importCourseTableJson(store, validJson).store;
    const result = clearImportedCourseTable(imported);

    assert.equal(result.removedCount, 2);
    assert.deepEqual(result.store.fixedEvents['2026-05-22'].map(event => event.id), ['manual-1']);
    assert.equal(result.store.fixedEvents['2026-05-23'], undefined);
  });

  it('rejects malformed course table json with a useful error', () => {
    assert.throws(
      () => parseCourseTableJson(JSON.stringify({ schema: COURSE_TABLE_SCHEMA_ID, events: [{ title: 'No date' }] })),
      /events\[0\]\.date/,
    );
  });
});
