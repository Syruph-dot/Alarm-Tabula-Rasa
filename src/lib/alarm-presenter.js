const DEFAULT_SWEEP_MS = 1200;
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
}) {
  if (!alarm) return { status: 'idle' };
  const startedAt = new Date(now);
  return {
    status: 'sweeping-in',
    alarm,
    startedAt,
    countdownStartedAt: new Date(startedAt.getTime() + sweepInMs),
    sweepInMs,
    sweepOutMs,
    totalSeconds: seconds,
    remainingSeconds: seconds,
    clickToDismiss,
    dismissedBy: null,
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
    .alarm-reveal-surface { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #050607; }
    .alarm-content { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px; }
    .alarm-screen.sweeping-in .alarm-reveal-surface { animation: revealMaskIn ${sweepInMs}ms var(--syr-push-strong) both; }
    .alarm-screen.dismissing .alarm-reveal-surface { animation: revealMaskOut ${sweepOutMs}ms var(--syr-push-strong) both; }
    .alarm-kicker { font-size: 20px; color: #9ca6b2; }
    .alarm-label { font-size: 64px; font-weight: 800; max-width: 86vw; text-align: center; overflow-wrap: anywhere; }
    .alarm-countdown { font-size: 34px; color: #9bd67d; }
    @keyframes revealMaskIn {
      0% { clip-path: inset(0 100% 0 0); opacity: 1; }
      100% { clip-path: inset(0 0 0 0); opacity: 1; }
    }
    @keyframes revealMaskOut {
      0% { clip-path: inset(0 0 0 0); opacity: 1; }
      100% { clip-path: inset(0 0 0 100%); opacity: 1; }
    }
  </style>
</head>
<body>
  <main class="${screenClass}" onclick="window.dismissAlarm && window.dismissAlarm()">
    <div class="alarm-reveal-surface">
    <div class="alarm-content">
    <div class="alarm-kicker">接下来</div>
    <div class="alarm-label">${escapeHtml(label)}</div>
    <div class="alarm-countdown">${remaining}</div>
    </div>
    </div>
  </main>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
