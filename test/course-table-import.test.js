import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearImportedCourseTable,
  COURSE_TABLE_WEEKLY_SCHEMA_ID,
  getAllCourseEvents,
  getCourseEventsForDate,
  importCourseWeeklySchedule,
  parseCourseTableJson,
} from '../src/lib/course-table-import.js';

const validJson = JSON.stringify({
  schema: COURSE_TABLE_WEEKLY_SCHEMA_ID,
  timezone: '+08:00',
  events: [
    {
      dayOfWeek: 1,
      title: '高等数学',
      startTime: '09:55',
      endTime: '11:30',
      location: '宝山213',
      teacher: '洪老师',
    },
    {
      dayOfWeek: 3,
      title: '电路分析',
      startTime: '15:25',
      endTime: '17:50',
    },
  ],
});

const store = {
  version: 1,
  fixedEvents: {
    '2026-05-22': [{ id: 'manual-1', label: 'Manual meeting', source: 'fixed' }],
  },
  reminderItems: [],
  comparisonHistory: [],
  generatedTables: {},
  courseWeeklySchedule: [],
  settings: {},
  runtime: {},
};

describe('course table import', () => {
  it('parses the weekly schema into day-of-week entries', () => {
    const parsed = parseCourseTableJson(validJson);

    assert.equal(parsed.schema, COURSE_TABLE_WEEKLY_SCHEMA_ID);
    assert.equal(parsed.entries.length, 2);
    assert.equal(parsed.entries[0].dayOfWeek, 1);
    assert.equal(parsed.entries[0].label, '高等数学 @ 宝山213');
    assert.equal(parsed.entries[0].startTime, '09:55');
    assert.equal(parsed.entries[0].endTime, '11:30');
    assert.equal(parsed.entries[1].dayOfWeek, 3);
  });

  it('imports weekly schedule into store.courseWeeklySchedule', () => {
    const result = importCourseWeeklySchedule(store, validJson);

    assert.equal(result.importedCount, 2);
    assert.equal(result.store.courseWeeklySchedule.length, 2);
    assert.equal(result.store.courseWeeklySchedule[0].dayOfWeek, 1);
    assert.equal(result.store.courseWeeklySchedule[0].label, '高等数学 @ 宝山213');
  });

  it('getCourseEventsForDate returns events for the matching weekday', () => {
    const storeWithCourses = importCourseWeeklySchedule(store, validJson).store;

    // 2026-05-22 is a Friday (dayOfWeek=5) → no courses
    const fridayEvents = getCourseEventsForDate(storeWithCourses, '2026-05-22');
    assert.equal(fridayEvents.length, 0);

    // 2026-05-25 is a Monday (dayOfWeek=1) → 高等数学
    const mondayEvents = getCourseEventsForDate(storeWithCourses, '2026-05-25');
    assert.equal(mondayEvents.length, 1);
    assert.equal(mondayEvents[0].label, '高等数学 @ 宝山213');
    assert.ok(mondayEvents[0].startTime.startsWith('2026-05-25T09:55'));
    assert.ok(mondayEvents[0].endTime.startsWith('2026-05-25T11:30'));

    // 2026-05-27 is a Wednesday (dayOfWeek=3) → 电路分析
    const wedEvents = getCourseEventsForDate(storeWithCourses, '2026-05-27');
    assert.equal(wedEvents.length, 1);
    assert.equal(wedEvents[0].label, '电路分析');
  });

  it('getAllCourseEvents groups by weekday name', () => {
    const storeWithCourses = importCourseWeeklySchedule(store, validJson).store;
    const result = getAllCourseEvents(storeWithCourses);

    assert.equal(result.totalCount, 2);
    assert.ok(result.events['周一']);
    assert.ok(result.events['周三']);
    assert.equal(result.events['周一'].length, 1);
    assert.equal(result.events['周一'][0].label, '高等数学 @ 宝山213');
  });

  it('clearImportedCourseTable clears the weekly schedule', () => {
    const storeWithCourses = importCourseWeeklySchedule(store, validJson).store;
    const result = clearImportedCourseTable(storeWithCourses);

    assert.equal(result.removedCount, 2);
    assert.deepEqual(result.store.courseWeeklySchedule, []);
  });

  it('rejects malformed course table json with a useful error', () => {
    assert.throws(
      () => parseCourseTableJson(JSON.stringify({ schema: COURSE_TABLE_WEEKLY_SCHEMA_ID, events: [{ dayOfWeek: 'x' }] })),
      /dayOfWeek/,
    );
  });

  it('rejects wrong schema id', () => {
    assert.throws(
      () => parseCourseTableJson(JSON.stringify({ schema: 'wrong-schema', events: [] })),
      /schema must be/,
    );
  });
});
