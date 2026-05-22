const DEFAULT_TZ = '+08:00';

export const COURSE_TABLE_SCHEMA_ID = 'tabula-rasa.course-table-v1';

export const COURSE_TABLE_AI_PROMPT = `请把我提供的课程表文件转换为严格 JSON。只输出 JSON，不要输出解释、Markdown 或代码块。

目标 schema:
{
  "schema": "tabula-rasa.course-table-v1",
  "timezone": "+08:00",
  "events": [
    {
      "date": "YYYY-MM-DD",
      "title": "课程或事件名称",
      "startTime": "HH:mm",
      "endTime": "HH:mm",
      "location": "地点，可省略",
      "teacher": "老师，可省略",
      "notes": "备注，可省略"
    }
  ]
}

规则:
- schema 必须等于 "tabula-rasa.course-table-v1"。
- date 使用公历 YYYY-MM-DD。
- startTime/endTime 使用 24 小时 HH:mm。
- 每节课都拆成一个 events 项。
- 如果课程表里有周次信息，只保留实际会发生的日期；不确定日期时请先根据文件上下文推断，不要编造。
- 不要合并不同课程；同一课程连续节次可以合并为一个时间段。
- 不要输出注释、尾逗号或 Markdown。`;

function clone(value) {
  return structuredClone(value);
}

function assertPlainObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
}

function assertRequiredString(value, field) {
  if (!String(value ?? '').trim()) throw new Error(`${field} is required`);
  return String(value).trim();
}

function assertDate(value, field) {
  const date = assertRequiredString(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`${field} must use YYYY-MM-DD`);
  return date;
}

function assertTime(value, field) {
  const time = assertRequiredString(value, field);
  if (!/^\d{2}:\d{2}$/.test(time)) throw new Error(`${field} must use HH:mm`);
  return time;
}

function normalizeTimezone(value) {
  const timezone = String(value ?? DEFAULT_TZ).trim();
  if (!/^[+-]\d{2}:\d{2}$/.test(timezone)) throw new Error('timezone must use +HH:mm or -HH:mm');
  return timezone;
}

function dateTime(date, time, timezone) {
  return `${date}T${time}:00${timezone}`;
}

function slug(value, fallback = 'course') {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

function eventId(event) {
  return [
    'course',
    event.date,
    slug(event.title),
    event.startTime.replace(':', ''),
    event.endTime.replace(':', ''),
  ].join('-');
}

function labelFor(event) {
  return event.location ? `${event.title} @ ${event.location}` : event.title;
}

function normalizeCourseEvent(raw, index, timezone) {
  assertPlainObject(raw, `events[${index}]`);
  const date = assertDate(raw.date, `events[${index}].date`);
  const title = assertRequiredString(raw.title ?? raw.label, `events[${index}].title`);
  const startTime = assertTime(raw.startTime, `events[${index}].startTime`);
  const endTime = assertTime(raw.endTime, `events[${index}].endTime`);
  const start = new Date(dateTime(date, startTime, timezone));
  const end = new Date(dateTime(date, endTime, timezone));
  if (end <= start) throw new Error(`events[${index}].endTime must be after startTime`);
  const event = {
    date,
    title,
    startTime,
    endTime,
    location: String(raw.location ?? '').trim(),
    teacher: String(raw.teacher ?? '').trim(),
    notes: String(raw.notes ?? '').trim(),
  };

  return {
    id: eventId(event),
    label: labelFor(event),
    startTime: dateTime(date, startTime, timezone),
    endTime: dateTime(date, endTime, timezone),
    source: 'course-import',
    metadata: {
      title,
      location: event.location,
      teacher: event.teacher,
      notes: event.notes,
      importedBy: COURSE_TABLE_SCHEMA_ID,
    },
  };
}

export function parseCourseTableJson(jsonText) {
  let raw;
  try {
    raw = JSON.parse(String(jsonText ?? ''));
  } catch {
    throw new Error('course table JSON is not valid JSON');
  }

  assertPlainObject(raw, 'root');
  if (raw.schema !== COURSE_TABLE_SCHEMA_ID) {
    throw new Error(`schema must be ${COURSE_TABLE_SCHEMA_ID}`);
  }
  if (!Array.isArray(raw.events)) throw new Error('events must be an array');

  const timezone = normalizeTimezone(raw.timezone);
  const events = raw.events
    .map((event, index) => normalizeCourseEvent(event, index, timezone))
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  return {
    schema: COURSE_TABLE_SCHEMA_ID,
    timezone,
    events,
  };
}

function groupedByDate(events) {
  return events.reduce((grouped, event) => {
    const date = event.startTime.slice(0, 10);
    grouped[date] = [...(grouped[date] ?? []), event];
    return grouped;
  }, {});
}

export function importCourseTableJson(store, jsonText) {
  const parsed = parseCourseTableJson(jsonText);
  const importedByDate = groupedByDate(parsed.events);
  const affectedDates = new Set([
    ...Object.keys(store.fixedEvents ?? {}),
    ...Object.keys(importedByDate),
  ]);
  const fixedEvents = {};

  for (const date of affectedDates) {
    const preserved = (store.fixedEvents?.[date] ?? []).filter(event => event.source !== 'course-import');
    const nextEvents = [
      ...preserved,
      ...(importedByDate[date] ?? []),
    ].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    if (nextEvents.length > 0) fixedEvents[date] = nextEvents;
  }

  return {
    store: {
      ...clone(store),
      fixedEvents,
    },
    importedCount: parsed.events.length,
  };
}

export function clearImportedCourseTable(store) {
  const fixedEvents = {};
  let removedCount = 0;

  for (const [date, events] of Object.entries(store.fixedEvents ?? {})) {
    const preserved = events.filter(event => event.source !== 'course-import');
    removedCount += events.length - preserved.length;
    if (preserved.length > 0) fixedEvents[date] = preserved;
  }

  return {
    store: {
      ...clone(store),
      fixedEvents,
    },
    removedCount,
  };
}
