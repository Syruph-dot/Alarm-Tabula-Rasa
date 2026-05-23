const DEFAULT_TZ = '+08:00';

export const COURSE_TABLE_WEEKLY_SCHEMA_ID = 'tabula-rasa.course-table-weekly-v1';

export const COURSE_TABLE_AI_PROMPT = `请把我提供的课程表文件转换为严格 JSON。只输出 JSON，不要输出解释、Markdown 或代码块。

目标 schema:
{
  "schema": "tabula-rasa.course-table-weekly-v1",
  "timezone": "+08:00",
  "events": [
    {
      "dayOfWeek": 1,
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
- schema 必须等于 "tabula-rasa.course-table-weekly-v1"。
- dayOfWeek 使用数字：1=周一, 2=周二, 3=周三, 4=周四, 5=周五, 6=周六, 7=周日。
- startTime/endTime 使用 24 小时 HH:mm。
- 每节课都拆成一个 events 项。
- 同一课程连续节次可以合并为一个时间段。
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

function assertDayOfWeek(value, field) {
  const day = Number(value);
  if (!Number.isInteger(day) || day < 1 || day > 7) {
    throw new Error(`${field} must be an integer 1-7 (1=Monday, 7=Sunday)`);
  }
  return day;
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

function slug(value, fallback = 'course') {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

function labelFor(event) {
  return event.location ? `${event.title} @ ${event.location}` : event.title;
}

export function parseCourseTableJson(jsonText) {
  let raw;
  try {
    raw = JSON.parse(String(jsonText ?? ''));
  } catch {
    throw new Error('course table JSON is not valid JSON');
  }

  assertPlainObject(raw, 'root');
  if (raw.schema !== COURSE_TABLE_WEEKLY_SCHEMA_ID) {
    throw new Error(`schema must be ${COURSE_TABLE_WEEKLY_SCHEMA_ID}`);
  }
  if (!Array.isArray(raw.events)) throw new Error('events must be an array');

  const timezone = normalizeTimezone(raw.timezone);
  const entries = raw.events.map((rawEvent, index) => {
    assertPlainObject(rawEvent, `events[${index}]`);
    const dayOfWeek = assertDayOfWeek(rawEvent.dayOfWeek, `events[${index}].dayOfWeek`);
    const title = assertRequiredString(rawEvent.title ?? rawEvent.label, `events[${index}].title`);
    const startTime = assertTime(rawEvent.startTime, `events[${index}].startTime`);
    const endTime = assertTime(rawEvent.endTime, `events[${index}].endTime`);
    if (startTime >= endTime) throw new Error(`events[${index}].endTime must be after startTime`);

    return {
      id: `course-${dayOfWeek}-${title}-${startTime.replace(':', '')}-${endTime.replace(':', '')}`,
      dayOfWeek,
      label: labelFor({ title, location: rawEvent.location }),
      startTime,
      endTime,
      locked: true,
      metadata: {
        title,
        location: String(rawEvent.location ?? '').trim(),
        teacher: String(rawEvent.teacher ?? '').trim(),
        notes: String(rawEvent.notes ?? '').trim(),
        importedBy: COURSE_TABLE_WEEKLY_SCHEMA_ID,
      },
    };
  });

  return {
    schema: COURSE_TABLE_WEEKLY_SCHEMA_ID,
    timezone,
    entries,
  };
}

export function importCourseWeeklySchedule(store, jsonText) {
  const parsed = parseCourseTableJson(jsonText);
  return {
    store: {
      ...clone(store),
      courseWeeklySchedule: parsed.entries,
    },
    importedCount: parsed.entries.length,
  };
}

export function getCourseEventsForDate(store, date) {
  const dateObj = new Date(date);
  if (Number.isNaN(dateObj.getTime())) return [];

  // getDay(): 0=Sun, 1=Mon, ... 6=Sat → convert to 1=Mon..7=Sun
  const dayIndex = dateObj.getDay() || 7;
  const schedule = store.courseWeeklySchedule ?? [];

  return schedule
    .filter(entry => entry.dayOfWeek === dayIndex)
    .map(entry => ({
      id: entry.id,
      label: entry.label,
      startTime: `${date}T${entry.startTime}:00${DEFAULT_TZ}`,
      endTime: `${date}T${entry.endTime}:00${DEFAULT_TZ}`,
      source: 'course-import',
      locked: true,
      metadata: { ...entry.metadata },
    }));
}

export function getAllCourseEvents(store) {
  const dayNames = { 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六', 7: '周日' };
  const byDay = {};
  const schedule = store.courseWeeklySchedule ?? [];

  for (const entry of schedule) {
    const dayName = dayNames[entry.dayOfWeek] ?? `Day${entry.dayOfWeek}`;
    if (!byDay[dayName]) byDay[dayName] = [];
    byDay[dayName].push(entry);
  }

  return {
    events: byDay,
    totalCount: schedule.length,
  };
}

export function clearImportedCourseTable(store) {
  const removedCount = (store.courseWeeklySchedule ?? []).length;
  return {
    store: {
      ...clone(store),
      courseWeeklySchedule: [],
    },
    removedCount,
  };
}
