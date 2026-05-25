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

  it('keeps the Blue Archive sweep-in active for the triangle and linear-domain phases', () => {
    const state = createAlarmState({
      alarm: getNextAlarm(blocks, new Date('2026-05-22T12:30:00+08:00')),
      seconds: 30,
      now: new Date('2026-05-22T12:30:00+08:00'),
      transitionEffectId: 'blue-archive.sweep-1',
    });
    const afterTrianglePhase = tickAlarm(state, {
      now: new Date('2026-05-22T12:30:01.300+08:00'),
    });
    const showing = tickAlarm(state, {
      now: new Date('2026-05-22T12:30:02.500+08:00'),
    });

    assert.equal(state.sweepInMs, 2400);
    assert.equal(state.countdownStartedAt.toISOString(), new Date('2026-05-22T12:30:02.400+08:00').toISOString());
    assert.equal(afterTrianglePhase.status, 'sweeping-in');
    assert.equal(showing.status, 'showing');
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

  it('renders the Blue Archive sweep as an eased equilateral-triangle screen wipe', () => {
    const state = createAlarmState({
      alarm: getNextAlarm(blocks, new Date('2026-05-22T12:30:00+08:00')),
      seconds: 30,
      now: new Date('2026-05-22T12:30:00+08:00'),
      transitionEffectId: 'blue-archive.sweep-1',
      transitionTriangleSizePx: 600,
      transitionTiltDeg: -16,
      transitionViewportWidth: 1280,
      transitionViewportHeight: 720,
    });
    const html = renderAlarmHtml(state);

    assert.match(html, /ba-triangle-sweep/);
    assert.match(html, /--triangle-size:\s*600px/);
    assert.match(html, /--triangle-height:\s*519\.615/);
    assert.match(html, /--grid-tilt:\s*-16deg/);
    assert.match(html, /--triangle-phase-ms:\s*1200ms/);
    assert.match(html, /--linear-phase-ms:\s*1200ms/);
    assert.match(html, /--linear-phase-delay:\s*1200ms/);
    assert.match(html, /--triangle-soft-ms:\s*\d+ms/);
    assert.match(html, /--tri-points:50% 0,\s*100% 100%,\s*0 100%/);
    assert.match(html, /--tri-points:0 0,\s*100% 0,\s*50% 100%/);
    assert.match(html, /--tri-delay:\s*\d+ms/);
    assert.match(html, /clip-path:\s*polygon\(var\(--tri-points\)\)/);
    assert.match(html, /ba-sky-domain top/);
    assert.match(html, /ba-sky-domain bottom/);
    assert.match(html, /background:\s*#65d9ff/);
    assert.match(html, /\.ba-grid\s*\{[^}]*z-index:\s*1/s);
    assert.match(html, /\.ba-sky-domain\s*\{[^}]*z-index:\s*0/s);
    assert.match(html, /\.ba-sky-domain\.top\s*\{[^}]*transform:\s*scaleY\(1\)/s);
    assert.match(html, /\.ba-triangle-sweep \.alarm-content\s*\{[^}]*z-index:\s*2/s);
    assert.match(html, /\.alarm-screen\.sweeping-in \.ba-grid i\s*\{\s*animation:\s*baTriangleIn var\(--triangle-soft-ms\) var\(--syr-push-strong\) var\(--tri-delay\) both/s);
    assert.match(html, /@keyframes baTriangleIn\s*\{[\s\S]*0%\s*\{[^}]*scale\(0\)[^}]*\}[\s\S]*100%\s*\{[^}]*scale\(1\)[^}]*\}/);
    assert.match(html, /\.alarm-screen\.sweeping-in \.ba-sky-domain\.top\s*\{\s*animation:\s*baSkyTopIn var\(--linear-phase-ms\) var\(--syr-push-strong\) var\(--linear-phase-delay\) both/s);
    assert.match(html, /\.alarm-screen\.sweeping-in \.ba-sky-domain\.bottom\s*\{\s*animation:\s*baSkyBottomIn var\(--linear-phase-ms\) var\(--syr-push-strong\) var\(--linear-phase-delay\) both/s);
    assert.match(html, /mask-image:\s*linear-gradient\(#000,\s*#000\),\s*linear-gradient\(#000,\s*#000\)/);
    assert.match(html, /mask-position:\s*top,\s*bottom/);
    assert.match(html, /mask-size:\s*100% 50%,\s*100% 50%/);
    assert.match(html, /\.alarm-screen\.sweeping-in \.ba-triangle-sweep \.alarm-content\s*\{\s*animation:\s*baContentClipIn var\(--linear-phase-ms\) var\(--syr-push-strong\) var\(--linear-phase-delay\) both/s);
    assert.match(html, /@keyframes baContentClipIn\s*\{[\s\S]*0%\s*\{\s*mask-size:\s*100% 0%,\s*100% 0%;\s*-webkit-mask-size:\s*100% 0%,\s*100% 0%;\s*\}[\s\S]*100%\s*\{\s*mask-size:\s*100% 50%,\s*100% 50%;\s*-webkit-mask-size:\s*100% 50%,\s*100% 50%;\s*\}/);
    assert.match(html, /transform:\s*translate\(var\(--x\), var\(--y\)\) scale\(1\)/);
    assert.match(html, /opacity:\s*0\.98/);
    assert.doesNotMatch(html, /\.alarm-screen\.sweeping-in \.ba-triangle-sweep \{\s*animation:/);
    assert.doesNotMatch(html, /requestAnimationFrame|style\.setProperty|data-cx|filter:|drop-shadow|text-shadow|baTriangleOut|baContentIn|baContentOut|translateY|--delay:|--out-delay:|--content-delay|--content-reveal-ms/);
    assert.doesNotMatch(html, /35\.5%|66\.7%|phaseProgress|black phase/i);

    const blueArchiveCss = html.match(/\.ba-triangle-sweep[\s\S]*?<\/style>/)?.[0] ?? '';
    const animationDeclarations = blueArchiveCss.match(/animation:\s*[^;]+;/g) ?? [];
    assert.ok(animationDeclarations.length > 0);
    assert.equal(
      animationDeclarations.every(declaration => declaration.includes('var(--syr-push-strong)')),
      true,
    );
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
