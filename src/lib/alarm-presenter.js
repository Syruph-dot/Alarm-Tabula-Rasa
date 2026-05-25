import {
  BLUE_ARCHIVE_SWEEP_1,
  DEFAULT_TRANSITION_SETTINGS,
  buildEquilateralTriangleGridModel,
  normalizeTransitionSettings,
} from './transition-effects.js';

const DEFAULT_SWEEP_MS = 2500;
const SYR_PUSH_STRONG_LINEAR = 'linear(0, 0.003 5%, 0.014 10%, 0.026 15%, 0.048 20%, 0.087 25%, 0.177 30%, 0.417 35%, 0.661 40%, 0.847 45%, 0.901 50%, 0.934 55%, 0.957 60%, 0.973 65%, 0.985 70%, 0.991 75%, 0.995 80%, 0.997 85%, 0.999 90%, 1 95%, 1)';

export function getNextAlarm(blocks, now) {
  const currentNow = new Date(now);
  const sorted = blocks
    .filter(block => block?.start && block?.end && block.end >= currentNow)
    .sort((a, b) => a.end - b.end);

  for (const block of sorted) {
    const nextBlock = sorted.find(candidate => candidate.start >= block.end && candidate.itemId !== block.itemId);
    if (block.end >= currentNow && nextBlock) {
      return {
        triggerAt: new Date(block.end),
        label: nextBlock.label,
        nextBlock,
        endingBlock: block,
      };
    }
  }

  return null;
}

export function getDueAlarm(blocks, now, lookbackMs = 30000) {
  const currentNow = new Date(now);
  const earliest = new Date(currentNow.getTime() - lookbackMs);
  const sorted = blocks
    .filter(block => block?.start && block?.end && block.end >= earliest && block.end <= currentNow)
    .sort((a, b) => a.end - b.end);

  for (const block of sorted) {
    const nextBlock = blocks
      .filter(candidate => candidate?.start && candidate?.end && candidate.start >= block.end && candidate.itemId !== block.itemId)
      .sort((a, b) => a.start - b.start)[0];
    if (nextBlock) {
      return {
        triggerAt: new Date(block.end),
        label: nextBlock.label,
        nextBlock,
        endingBlock: block,
      };
    }
  }

  return null;
}

export function createAlarmState({
  alarm,
  seconds,
  now,
  clickToDismiss = true,
  sweepInMs = DEFAULT_SWEEP_MS,
  sweepOutMs = sweepInMs,
  transitionEffectId = DEFAULT_TRANSITION_SETTINGS.transitionEffectId,
  transitionTriangleSizePx = DEFAULT_TRANSITION_SETTINGS.transitionTriangleSizePx,
  transitionTiltDeg = DEFAULT_TRANSITION_SETTINGS.transitionTiltDeg,
  transitionViewportWidth = 1920,
  transitionViewportHeight = 1080,
}) {
  if (!alarm) return { status: 'idle' };
  const startedAt = new Date(now);
  const transition = normalizeTransitionSettings({
    transitionEffectId,
    transitionTriangleSizePx,
    transitionTiltDeg,
  });
  const effectiveSweepInMs = transition.transitionEffectId === BLUE_ARCHIVE_SWEEP_1
    ? sweepInMs * 2
    : sweepInMs;
  const effectiveSweepOutMs = transition.transitionEffectId === BLUE_ARCHIVE_SWEEP_1
    ? sweepOutMs * 2
    : sweepOutMs;
  return {
    status: 'sweeping-in',
    alarm,
    startedAt,
    countdownStartedAt: new Date(startedAt.getTime() + effectiveSweepInMs),
    sweepInMs: effectiveSweepInMs,
    sweepOutMs: effectiveSweepOutMs,
    totalSeconds: seconds,
    remainingSeconds: seconds,
    clickToDismiss,
    dismissedBy: null,
    ...transition,
    transitionViewportWidth,
    transitionViewportHeight,
  };
}

export function tickAlarm(state, input = {}) {
  if (input.event === 'click') {
    if (!state.clickToDismiss) return state;
    if (state.status === 'dismissing') return state;
    const now = input.now ? new Date(input.now) : new Date();
    const sweepOutMs = state.sweepOutMs ?? state.sweepInMs ?? DEFAULT_SWEEP_MS;
    return {
      ...state,
      status: 'dismissing',
      dismissStartedAt: now,
      dismissEndsAt: new Date(now.getTime() + sweepOutMs),
      dismissedBy: input.action ?? 'click',
    };
  }

  if (!['showing', 'sweeping-in', 'dismissing'].includes(state.status)) return state;

  const now = input.now ? new Date(input.now) : new Date();
  if (state.status === 'dismissing') {
    const dismissEndsAt = state.dismissEndsAt
      ? new Date(state.dismissEndsAt)
      : new Date((state.dismissStartedAt ?? now).getTime() + (state.sweepOutMs ?? state.sweepInMs ?? DEFAULT_SWEEP_MS));
    if (now < dismissEndsAt) return state;
    return {
      ...state,
      status: 'dismissed',
      remainingSeconds: 0,
      dismissedBy: state.dismissedBy ?? 'click',
    };
  }

  if (state.status === 'sweeping-in' && now < state.countdownStartedAt) return state;

  const countdownStartedAt = state.countdownStartedAt ?? state.startedAt;
  const elapsed = Math.max(0, Math.floor((now - countdownStartedAt) / 1000));
  const remainingSeconds = Math.max(0, state.totalSeconds - elapsed);
  if (remainingSeconds <= 0) {
    const sweepOutMs = state.sweepOutMs ?? state.sweepInMs ?? DEFAULT_SWEEP_MS;
    return {
      ...state,
      status: 'dismissing',
      remainingSeconds: 0,
      dismissStartedAt: now,
      dismissEndsAt: new Date(now.getTime() + sweepOutMs),
      dismissedBy: 'auto',
    };
  }

  return { ...state, status: 'showing', remainingSeconds };
}

export function shouldRenderAlarmFrame(previousState, nextState) {
  if (!nextState || nextState.status === 'dismissed') return false;
  if (!previousState) return true;
  if (previousState.status === 'sweeping-in' && nextState.status === 'sweeping-in') return false;
  return (
    previousState.status !== nextState.status
    || previousState.remainingSeconds !== nextState.remainingSeconds
  );
}

export function renderAlarmHtml(state) {
  const label = state.alarm?.label ?? '';
  const remaining = state.remainingSeconds ?? 0;
  const animationClass = ['sweeping-in', 'dismissing'].includes(state.status) ? state.status : '';
  const screenClass = ['alarm-screen', animationClass].filter(Boolean).join(' ');
  const sweepInMs = state.sweepInMs ?? DEFAULT_SWEEP_MS;
  const sweepOutMs = state.sweepOutMs ?? state.sweepInMs ?? DEFAULT_SWEEP_MS;
  const transition = normalizeTransitionSettings({
    transitionEffectId: state.transitionEffectId,
    transitionTriangleSizePx: state.transitionTriangleSizePx,
    transitionTiltDeg: state.transitionTiltDeg,
  });
  transition.transitionViewportWidth = state.transitionViewportWidth;
  transition.transitionViewportHeight = state.transitionViewportHeight;
  const transitionSurface = transition.transitionEffectId === BLUE_ARCHIVE_SWEEP_1
    ? renderBlueArchiveSweepSurface({ label, remaining, sweepInMs, sweepOutMs, transition })
    : renderBaseSweepSurface({ label, remaining, sweepInMs, sweepOutMs });
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>Tabula Rasa Alarm</title>
  <style>
    * { box-sizing: border-box; }
    :root { --syr-push-strong: ${SYR_PUSH_STRONG_LINEAR}; }
    html, body { margin: 0; width: 100%; height: 100%; background: transparent; color: #f7fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .alarm-screen { width: 100vw; height: 100vh; cursor: pointer; }
    .alarm-content { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px; }
    .alarm-kicker { font-size: 20px; color: #9ca6b2; }
    .alarm-label { font-size: 64px; font-weight: 800; max-width: 86vw; text-align: center; overflow-wrap: anywhere; }
    .alarm-countdown { font-size: 34px; color: #9bd67d; }
    ${transitionSurface.style}
  </style>
</head>
<body>
  <main class="${screenClass}" onclick="window.dismissAlarm && window.dismissAlarm()">
    ${transitionSurface.body}
  </main>
</body>
</html>`;
}

function renderAlarmContent(label, remaining) {
  return `<div class="alarm-content">
    <div class="alarm-kicker">接下来</div>
    <div class="alarm-label">${escapeHtml(label)}</div>
    <div class="alarm-countdown">${remaining}</div>
    </div>`;
}

function renderBaseSweepSurface({ label, remaining, sweepInMs, sweepOutMs }) {
  return {
    style: `
    .alarm-reveal-surface { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #050607; }
    .alarm-screen.sweeping-in .alarm-reveal-surface { animation: revealMaskIn ${sweepInMs}ms var(--syr-push-strong) both; }
    .alarm-screen.dismissing .alarm-reveal-surface { animation: revealMaskOut ${sweepOutMs}ms var(--syr-push-strong) both; }
    @keyframes revealMaskIn {
      0% { clip-path: inset(0 100% 0 0); opacity: 1; }
      100% { clip-path: inset(0 0 0 0); opacity: 1; }
    }
    @keyframes revealMaskOut {
      0% { clip-path: inset(0 0 0 0); opacity: 1; }
      100% { clip-path: inset(0 0 0 100%); opacity: 1; }
    }`,
    body: `<div class="alarm-reveal-surface">${renderAlarmContent(label, remaining)}</div>`,
  };
}

function renderBlueArchiveSweepSurface({ label, remaining, sweepInMs, sweepOutMs, transition }) {
  const grid = buildEquilateralTriangleGridModel({
    viewportWidth: transition.transitionViewportWidth ?? 1920,
    viewportHeight: transition.transitionViewportHeight ?? 1080,
    triangleSizePx: transition.transitionTriangleSizePx,
    tiltDeg: transition.transitionTiltDeg,
  });
  const domainStart = grid.bounds.minX - grid.triangleSizePx * 2;
  const domainEnd = grid.bounds.maxX + grid.triangleSizePx * 2;
  const domainSpan = Math.max(1, domainEnd - domainStart);
  const sweepSoftness = round(Math.max(16, grid.triangleSizePx * 0.42));
  const palette = ['#a8ffff', '#19ffff', '#48dfff', '#8bc7ff', '#ffffff', '#71ffff', '#00f0ff', '#6bb8ff', '#b8d4ff'];
  const cells = grid.cells.map((cell, idx) => (
    `<i data-phase="${Math.random() * 6.283}" data-cx="${round(cell.cx)}" style="--x:${round(cell.x)}px;--y:${round(cell.y)}px;--tri-points:${cell.points};--tri-color:${palette[idx % palette.length]};"></i>`
  )).join('');
  return {
    style: `
    .ba-triangle-sweep { --triangle-size: ${grid.triangleSizePx}px; --grid-tilt: ${grid.tiltDeg}deg; --sweep-softness: ${sweepSoftness}px; --domain-start: ${domainStart}px; --domain-end: ${domainEnd}px; position: relative; width: 100%; height: 100%; overflow: hidden; background: transparent; display: flex; align-items: center; justify-content: center; }
    .ba-grid { position: absolute; inset: 0; z-index: 1; transform: rotate(var(--grid-tilt)); transform-origin: center; will-change: transform; }
    .ba-grid i { position: absolute; width: var(--triangle-size); height: calc(var(--triangle-size) * 0.866); clip-path: polygon(var(--tri-points)); background: var(--tri-color); opacity: 0.95; filter: drop-shadow(0 0 6px var(--tri-color)) brightness(var(--b, 1)); transform: translate(var(--x), var(--y)) scale(var(--scale, 0)); transform-origin: center; }
    .ba-driver { position: absolute; top: 0; left: 0; width: 1px; height: 1px; transform: translateX(var(--domain-start)); pointer-events: none; visibility: hidden; }
    .alarm-screen.sweeping-in .ba-driver { animation: baDriveIn ${sweepInMs}ms var(--syr-push-strong) both; }
    .alarm-screen.dismissing .ba-driver { animation: baDriveIn ${sweepOutMs}ms var(--syr-push-strong) both; }
    .ba-triangle-sweep .alarm-content { position: relative; z-index: 2; }
    .ba-bg { position: absolute; inset: 0; z-index: 0; background: #87CEEB; }
    @keyframes baDriveIn {
      0% { transform: translateX(var(--domain-start)); }
      100% { transform: translateX(var(--domain-end)); }
    }
    `,
    body: `<div class="ba-triangle-sweep"><div class="ba-grid"><span class="ba-driver"></span>${cells}</div><div class="ba-bg"></div>${renderAlarmContent(label, remaining)}<script>
    (() => {
      var root = document.currentScript.closest('.ba-triangle-sweep');
      if (!root) return;
      var driver = root.querySelector('.ba-driver');
      var tris = Array.from(root.querySelectorAll('.ba-grid i'));
      var content = root.querySelector('.alarm-content');
      var bg = root.querySelector('.ba-bg');
      var screenEl = root.closest('.alarm-screen') || root.parentElement;
      var st = getComputedStyle(root);
      var soft = parseFloat(st.getPropertyValue('--sweep-softness')) || 48;
      var ds = parseFloat(st.getPropertyValue('--domain-start')) || 0;
      var de = parseFloat(st.getPropertyValue('--domain-end')) || 1000;
      var mid = ds + (de - ds) * 0.5;
      var span = de - ds;

      function driverX() {
        var t = getComputedStyle(driver).transform;
        if (!t || t === 'none') return ds;
        var m = t.match(/matrix\\(([^)]+)\\)/);
        if (!m) return ds;
        var p = m[1].split(',').map(Number);
        return Number.isFinite(p[4]) ? p[4] : ds;
      }

      function sig(d) {
        if (d <= -soft * 20) return 1;
        if (d >= soft * 20) return 0;
        return 1 / (1 + Math.exp(d / soft));
      }

      function update() {
        var t = performance.now() * 0.002;
        var d1x = driverX();
        var d2x = d1x >= mid ? ds + (d1x - mid) * 2 : ds;
        for (var i = 0; i < tris.length; i++) {
          var cx = parseFloat(tris[i].dataset.cx);
          if (!Number.isFinite(cx)) continue;
          var s1 = sig(cx - d1x);
          var s2 = sig(d2x - cx);
          tris[i].style.setProperty('--scale', (s1 * s2 * 0.95).toFixed(3));
          var bright = 1.0 + 0.3 * Math.sin(t + (parseFloat(tris[i].dataset.phase) || 0));
          tris[i].style.setProperty('--b', bright.toFixed(3));
        }

        if (content) {
          if (screenEl.classList.contains('sweeping-in')) {
            var rc = Math.max(0, Math.min(100, 100 - (d2x - ds) / span * 200));
            content.style.clipPath = bg.style.clipPath = 'inset(0 ' + rc + '% 0 0)';
          } else if (screenEl.classList.contains('dismissing')) {
            var lc = Math.max(0, Math.min(100, (d1x - ds) / span * 100));
            content.style.clipPath = bg.style.clipPath = 'inset(0 0% 0 ' + lc + '%)';
          } else {
            content.style.clipPath = bg.style.clipPath = '';
          }
        }

        requestAnimationFrame(update);
      }
      update();
    })();
    <\/script></div>`,
  };
}

function round(value) {
  return Number(value.toFixed(3));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
