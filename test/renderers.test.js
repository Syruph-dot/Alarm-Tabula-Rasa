import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderMainHtml,
  renderTrayWidgetHtml,
} from '../src/main/renderers.js';

const view = {
  date: '2026-05-22',
  now: new Date('2026-05-22T08:10:00+08:00'),
  timeMode: 'mock',
  paused: false,
  settings: {
    dayStart: '08:00',
    dayEnd: '12:00',
    defaultEarlyEndCooldownMinutes: 180,
    minimumFillMinutes: 15,
  },
  fixedEvents: [
    {
      id: 'class-1',
      label: 'Class',
      startTime: '2026-05-22T10:00:00+08:00',
      endTime: '2026-05-22T11:00:00+08:00',
      source: 'class',
    },
  ],
  merged: [],
  freeIntervals: [],
  softFillBlocks: [
    {
      itemId: 'a',
      label: 'Task A',
      start: new Date('2026-05-22T08:00:00+08:00'),
      end: new Date('2026-05-22T08:30:00+08:00'),
      durationMinutes: 30,
      score: 1500,
    },
  ],
  reminderItems: [
    { id: 'a', label: 'Task A', active: true, defaultDurationMinutes: 30, importanceScore: 1500 },
    { id: 'b', label: 'Task B', active: true, defaultDurationMinutes: 25, importanceScore: 1400 },
  ],
  preferencePair: {
    left: { id: 'a', label: 'Task A', importanceScore: 1500 },
    right: { id: 'b', label: 'Task B', importanceScore: 1400 },
    prompt: 'First impression',
  },
};

describe('electron renderers', () => {
  it('renders a full editor with persistent data controls', () => {
    const html = renderMainHtml(view, { message: 'Saved', storePath: 'C:/Users/me/AppData/Roaming/TabulaRasa/data.json' });

    assert.match(html, /data-action="add-reminder"/);
    assert.match(html, /data-action="archive-reminder"/);
    assert.match(html, /data-action="add-fixed-event"/);
    assert.match(html, />Add Time Block</);
    assert.match(html, />Add time</);
    assert.match(html, /data-action="update-settings"/);
    assert.match(html, /data-action="set-time-mode"/);
    assert.match(html, /Course Table Import/);
    assert.match(html, /data-action="import-course-table"/);
    assert.match(html, /data-action="clear-course-table"/);
    assert.match(html, /清空课程表/);
    assert.match(html, /id="courseTableJson"/);
    assert.match(html, /id="courseTablePrompt"/);
    assert.match(html, /Copy prompt/);
    assert.match(html, /course-table-weekly-v1/);
    assert.match(html, /data-block-start/);
    assert.match(html, /data-block-end/);
    assert.match(html, /openProjectPicker/);
    assert.match(html, /class="tab"/);
    assert.match(html, /课程表/);
    assert.match(html, /个人项目/);
    assert.doesNotMatch(html, />Add Fixed Event</);
    assert.doesNotMatch(html, />Add fixed</);
    assert.doesNotMatch(html, /score 1500/);
    assert.doesNotMatch(html, /C:\/Users\/me\/AppData\/Roaming\/TabulaRasa\/data\.json/);
  });

  it('renders tray widget actions for comparison, temporary events, break, stop, and pause', () => {
    const html = renderTrayWidgetHtml(view, { message: 'Ready' });

    assert.match(html, /data-action="resolve-preference"/);
    assert.match(html, /data-action="quick-temp"/);
    assert.match(html, /data-action="end-current"/);
    assert.match(html, /data-action="adjust-current-end"/);
    assert.match(html, /data-action="add-break"/);
    assert.match(html, /休息30m/);
    assert.match(html, /data-action="toggle-pause"/);
    assert.doesNotMatch(html, /data-action="extend-current"/);
  });

  it('puts current actions before secondary choices in the quick panel without exposing scores', () => {
    const html = renderTrayWidgetHtml({
      ...view,
      now: new Date('2026-05-22T08:10:00+08:00'),
      softFillBlocks: [
        {
          itemId: 'current',
          label: 'Current focus',
          start: new Date('2026-05-22T08:00:00+08:00'),
          end: new Date('2026-05-22T08:30:00+08:00'),
          durationMinutes: 30,
          score: 1500,
        },
        {
          itemId: 'next',
          label: 'Next focus',
          start: new Date('2026-05-22T08:30:00+08:00'),
          end: new Date('2026-05-22T09:00:00+08:00'),
          durationMinutes: 30,
          score: 1400,
        },
      ],
    }, { message: 'Ready' });

    assert.ok(html.indexOf('Current focus') < html.indexOf('First impression'));
    assert.ok(html.indexOf('休息30m') < html.indexOf('First impression'));
    assert.match(html, /Next focus/);
    assert.doesNotMatch(html, /score 1500/);
    assert.doesNotMatch(html, /score 1400/);
    assert.doesNotMatch(html, /importanceScore/);
  });

  it('shows an active fixed event in the quick panel with end and cancel actions', () => {
    const html = renderTrayWidgetHtml({
      ...view,
      now: new Date('2026-05-22T10:15:00+08:00'),
      softFillBlocks: [],
      fixedEvents: [
        {
          id: 'class-1',
          label: 'Class block',
          startTime: '2026-05-22T10:00:00+08:00',
          endTime: '2026-05-22T11:00:00+08:00',
          source: 'course-import',
        },
        {
          id: 'office-1',
          label: 'Office hours',
          startTime: '2026-05-22T11:30:00+08:00',
          endTime: '2026-05-22T12:00:00+08:00',
          source: 'fixed',
        },
      ],
    }, { message: 'Ready' });

    assert.match(html, /Class block/);
    assert.match(html, /10:00-11:00/);
    assert.match(html, /Office hours/);
    assert.match(html, /data-action="adjust-fixed-event-end"/);
    assert.match(html, /data-action="end-fixed-event"/);
    assert.match(html, /data-action="cancel-fixed-event"/);
    assert.doesNotMatch(html, /No active block/);
    assert.doesNotMatch(html, /data-action="end-current"/);
  });

  it('marks day plan blocks as past, current, or future relative to now', () => {
    const html = renderMainHtml({
      ...view,
      now: new Date('2026-05-22T09:15:00+08:00'),
      softFillBlocks: [
        {
          itemId: 'past',
          label: 'Past block',
          start: new Date('2026-05-22T08:00:00+08:00'),
          end: new Date('2026-05-22T09:00:00+08:00'),
          durationMinutes: 60,
          score: 900,
        },
        {
          itemId: 'current',
          label: 'Current block',
          start: new Date('2026-05-22T09:00:00+08:00'),
          end: new Date('2026-05-22T09:30:00+08:00'),
          durationMinutes: 30,
          score: 1500,
        },
        {
          itemId: 'future',
          label: 'Future block',
          start: new Date('2026-05-22T09:30:00+08:00'),
          end: new Date('2026-05-22T10:00:00+08:00'),
          durationMinutes: 30,
          score: 1200,
        },
      ],
    });

    assert.match(html, /class="block past"[\s\S]*Past block/);
    assert.match(html, /class="block current"[\s\S]*Current block/);
    assert.match(html, /class="block future"[\s\S]*Future block/);
  });

  it('merges fixed time into the day plan without a separate fixed-events section or hard color class', () => {
    const html = renderMainHtml({
      ...view,
      now: new Date('2026-05-22T08:10:00+08:00'),
      fixedEvents: [
        {
          id: 'class-1',
          label: 'Class block',
          startTime: '2026-05-22T10:00:00+08:00',
          endTime: '2026-05-22T11:00:00+08:00',
          source: 'class',
        },
      ],
      softFillBlocks: [
        {
          itemId: 'a',
          label: 'Task A',
          start: new Date('2026-05-22T08:00:00+08:00'),
          end: new Date('2026-05-22T08:30:00+08:00'),
          durationMinutes: 30,
        },
      ],
    });

    assert.ok(html.indexOf('Task A') < html.indexOf('Class block'));
    assert.doesNotMatch(html, />Fixed Events</);
    assert.doesNotMatch(html, />Add Fixed Event</);
    assert.doesNotMatch(html, /class="block hard"/);
    assert.doesNotMatch(html, /\.block\.hard/);
    assert.doesNotMatch(html, />class</);
    assert.doesNotMatch(html, />Scheduled</);
  });
});
