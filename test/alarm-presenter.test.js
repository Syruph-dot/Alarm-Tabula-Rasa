import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAlarmState,
  getNextAlarm,
  renderAlarmHtml,
  shouldRenderAlarmFrame,
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

  it('counts down while showing then sweeps out before auto-dismiss', () => {
    const state = createAlarmState({
      alarm: getNextAlarm(blocks, new Date('2026-05-22T12:30:00+08:00')),
      seconds: 3,
      now: new Date('2026-05-22T12:30:00+08:00'),
    });
    const ticking = tickAlarm(state, {
      now: new Date('2026-05-22T12:30:03.200+08:00'),
    });
    const dismissing = tickAlarm(ticking, {
      now: new Date('2026-05-22T12:30:04.200+08:00'),
    });
    const dismissed = tickAlarm(dismissing, {
      now: new Date('2026-05-22T12:30:05.500+08:00'),
    });

    assert.equal(state.status, 'sweeping-in');
    assert.equal(ticking.remainingSeconds, 1);
    assert.equal(ticking.status, 'showing');
    assert.equal(dismissing.status, 'dismissing');
    assert.equal(dismissing.dismissedBy, 'auto');
    assert.equal(dismissed.status, 'dismissed');
    assert.equal(dismissed.dismissedBy, 'auto');
  });

  it('starts with a sweep-in stage before the countdown begins', () => {
    const state = createAlarmState({
      alarm: getNextAlarm(blocks, new Date('2026-05-22T12:30:00+08:00')),
      seconds: 30,
      now: new Date('2026-05-22T12:30:00+08:00'),
    });
    const sweeping = tickAlarm(state, {
      now: new Date('2026-05-22T12:30:00.500+08:00'),
    });
    const showing = tickAlarm(state, {
      now: new Date('2026-05-22T12:30:01.300+08:00'),
    });

    assert.equal(state.status, 'sweeping-in');
    assert.equal(sweeping.status, 'sweeping-in');
    assert.equal(showing.status, 'showing');
    assert.equal(showing.remainingSeconds, 30);
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

    assert.equal(tickAlarm(clickable, { event: 'click' }).status, 'dismissing');
    assert.equal(tickAlarm(locked, { event: 'click' }).status, 'sweeping-in');
  });

  it('uses a sweep-out stage before dismissing after a click', () => {
    const showing = tickAlarm(createAlarmState({
      alarm: getNextAlarm(blocks, new Date('2026-05-22T12:30:00+08:00')),
      seconds: 30,
      now: new Date('2026-05-22T12:30:00+08:00'),
    }), {
      now: new Date('2026-05-22T12:30:01.300+08:00'),
    });
    const dismissing = tickAlarm(showing, {
      event: 'click',
      now: new Date('2026-05-22T12:30:02+08:00'),
    });
    const dismissed = tickAlarm(dismissing, {
      now: new Date('2026-05-22T12:30:03.300+08:00'),
    });

    assert.equal(dismissing.status, 'dismissing');
    assert.equal(dismissing.dismissStartedAt.toISOString(), new Date('2026-05-22T12:30:02+08:00').toISOString());
    assert.equal(dismissed.status, 'dismissed');
    assert.equal(dismissed.dismissedBy, 'click');
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

  it('keeps the browser window page transparent so the reveal is not preceded by a black fullscreen fill', () => {
    const state = createAlarmState({
      alarm: getNextAlarm(blocks, new Date('2026-05-22T12:30:00+08:00')),
      seconds: 30,
      now: new Date('2026-05-22T12:30:00+08:00'),
    });
    const html = renderAlarmHtml(state);

    assert.match(html, /html,\s*body\s*\{[^}]*background:\s*transparent/s);
    assert.match(html, /\.alarm-reveal-surface\s*\{[^}]*background:\s*#050607/s);
    assert.doesNotMatch(html, /body\s*\{[^}]*background:\s*#050607/s);
  });

  it('renders an eased left-to-right mask reveal without moving the content', () => {
    const state = createAlarmState({
      alarm: getNextAlarm(blocks, new Date('2026-05-22T12:30:00+08:00')),
      seconds: 30,
      now: new Date('2026-05-22T12:30:00+08:00'),
    });
    const html = renderAlarmHtml(state);

    assert.match(html, /class="alarm-screen sweeping-in"/);
    assert.match(html, /class="alarm-reveal-surface"/);
    assert.match(html, /class="alarm-content"/);
    assert.match(html, /@keyframes revealMask/);
    assert.match(html, /--syr-push-strong:\s*linear\(/);
    assert.match(html, /animation:\s*revealMaskIn .* var\(--syr-push-strong\) both/);
    assert.match(html, /clip-path:\s*inset\(0 100% 0 0\)/);
    assert.match(html, /clip-path:\s*inset\(0 0 0 0\)/);
    assert.doesNotMatch(html, /translateX/);
  });

  it('renders the same masked sweep for the exit animation', () => {
    const state = {
      ...createAlarmState({
        alarm: getNextAlarm(blocks, new Date('2026-05-22T12:30:00+08:00')),
        seconds: 30,
        now: new Date('2026-05-22T12:30:00+08:00'),
      }),
      status: 'dismissing',
    };
    const html = renderAlarmHtml(state);

    assert.match(html, /class="alarm-screen dismissing"/);
    assert.match(html, /@keyframes revealMaskOut/);
    assert.match(html, /animation:\s*revealMaskOut .* var\(--syr-push-strong\) both/);
    assert.match(html, /clip-path:\s*inset\(0 0 0 0\)/);
    assert.match(html, /clip-path:\s*inset\(0 0 0 100%\)/);
  });

  it('does not refresh the full alarm page while the sweep-in animation is still running', () => {
    const state = createAlarmState({
      alarm: getNextAlarm(blocks, new Date('2026-05-22T12:30:00+08:00')),
      seconds: 30,
      now: new Date('2026-05-22T12:30:00+08:00'),
    });
    const stillSweeping = tickAlarm(state, {
      now: new Date('2026-05-22T12:30:00.500+08:00'),
    });
    const showing = tickAlarm(state, {
      now: new Date('2026-05-22T12:30:01.300+08:00'),
    });

    assert.equal(shouldRenderAlarmFrame(null, state), true);
    assert.equal(shouldRenderAlarmFrame(state, stillSweeping), false);
    assert.equal(shouldRenderAlarmFrame(stillSweeping, showing), true);
  });

  it('continues rendering during dismissing until the sweep-out completes', () => {
    const showing = tickAlarm(createAlarmState({
      alarm: getNextAlarm(blocks, new Date('2026-05-22T12:30:00+08:00')),
      seconds: 30,
      now: new Date('2026-05-22T12:30:00+08:00'),
    }), {
      now: new Date('2026-05-22T12:30:01.300+08:00'),
    });
    const dismissing = tickAlarm(showing, {
      event: 'click',
      now: new Date('2026-05-22T12:30:02+08:00'),
    });
    const stillDismissing = tickAlarm(dismissing, {
      now: new Date('2026-05-22T12:30:02.500+08:00'),
    });
    const dismissed = tickAlarm(dismissing, {
      now: new Date('2026-05-22T12:30:03.300+08:00'),
    });

    assert.equal(shouldRenderAlarmFrame(showing, dismissing), true);
    assert.equal(shouldRenderAlarmFrame(dismissing, stillDismissing), false);
    assert.equal(shouldRenderAlarmFrame(stillDismissing, dismissed), false);
  });
});
