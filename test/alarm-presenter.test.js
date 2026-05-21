import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAlarmState,
  getNextAlarm,
  renderAlarmHtml,
  tickAlarm,
} from '../src/lib/alarm-presenter.js';

const blocks = [
  {
    itemId: 'a',
    label: '项目 A',
    start: new Date('2026-05-22T12:00:00+08:00'),
    end: new Date('2026-05-22T12:30:00+08:00'),
    durationMinutes: 30,
  },
  {
    itemId: 'b',
    label: '项目 B',
    start: new Date('2026-05-22T12:30:00+08:00'),
    end: new Date('2026-05-22T13:00:00+08:00'),
    durationMinutes: 30,
  },
];

describe('alarm presenter', () => {
  it('selects next alarm when generated block ends', () => {
    const alarm = getNextAlarm(blocks, new Date('2026-05-22T12:29:00+08:00'));

    assert.ok(alarm);
    assert.equal(alarm.label, '项目 B');
    assert.equal(alarm.triggerAt.toISOString(), new Date('2026-05-22T12:30:00+08:00').toISOString());
    assert.equal(alarm.nextBlock.itemId, 'b');
  });

  it('returns null when no future block transition exists', () => {
    assert.equal(getNextAlarm(blocks, new Date('2026-05-22T13:01:00+08:00')), null);
  });

  it('counts down while showing then auto-dismisses', () => {
    const state = createAlarmState({
      alarm: getNextAlarm(blocks, new Date('2026-05-22T12:30:00+08:00')),
      seconds: 3,
      now: new Date('2026-05-22T12:30:00+08:00'),
    });
    const ticking = tickAlarm(state, {
      now: new Date('2026-05-22T12:30:02+08:00'),
    });
    const dismissed = tickAlarm(ticking, {
      now: new Date('2026-05-22T12:30:03+08:00'),
    });

    assert.equal(state.status, 'showing');
    assert.equal(ticking.remainingSeconds, 1);
    assert.equal(dismissed.status, 'dismissed');
    assert.equal(dismissed.dismissedBy, 'auto');
  });

  it('click dismisses only when enabled', () => {
    const alarm = getNextAlarm(blocks, new Date('2026-05-22T12:30:00+08:00'));
    const clickable = createAlarmState({
      alarm,
      seconds: 30,
      now: new Date('2026-05-22T12:30:00+08:00'),
      clickToDismiss: true,
    });
    const locked = createAlarmState({
      alarm,
      seconds: 30,
      now: new Date('2026-05-22T12:30:00+08:00'),
      clickToDismiss: false,
    });

    assert.equal(tickAlarm(clickable, { event: 'click' }).status, 'dismissed');
    assert.equal(tickAlarm(locked, { event: 'click' }).status, 'showing');
  });

  it('renders fullscreen lightweight alarm without scheduling decisions', () => {
    const state = createAlarmState({
      alarm: getNextAlarm(blocks, new Date('2026-05-22T12:30:00+08:00')),
      seconds: 30,
      now: new Date('2026-05-22T12:30:00+08:00'),
    });
    const html = renderAlarmHtml(state);

    assert.match(html, /项目 B/);
    assert.match(html, /30/);
    assert.doesNotMatch(html, /延长|跳过|重排|extend|skip|reschedule/i);
    assert.match(html, /alarm-screen/);
  });
});
