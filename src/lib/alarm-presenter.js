export function getNextAlarm(blocks, now) {
  const sorted = blocks
    .filter(block => block?.start && block?.end && block.end >= now)
    .sort((a, b) => a.end - b.end);

  for (const block of sorted) {
    const nextBlock = sorted.find(candidate => candidate.start >= block.end && candidate.itemId !== block.itemId);
    if (block.end >= now && nextBlock) {
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
}) {
  if (!alarm) return { status: 'idle' };
  return {
    status: 'showing',
    alarm,
    startedAt: new Date(now),
    totalSeconds: seconds,
    remainingSeconds: seconds,
    clickToDismiss,
    dismissedBy: null,
  };
}

export function tickAlarm(state, input = {}) {
  if (state.status !== 'showing') return state;

  if (input.event === 'click') {
    if (!state.clickToDismiss) return state;
    return { ...state, status: 'dismissed', remainingSeconds: 0, dismissedBy: 'click' };
  }

  const now = input.now ? new Date(input.now) : new Date();
  const elapsed = Math.max(0, Math.floor((now - state.startedAt) / 1000));
  const remainingSeconds = Math.max(0, state.totalSeconds - elapsed);
  if (remainingSeconds <= 0) {
    return { ...state, status: 'dismissed', remainingSeconds: 0, dismissedBy: 'auto' };
  }

  return { ...state, remainingSeconds };
}

export function renderAlarmHtml(state) {
  const label = state.alarm?.label ?? '';
  const remaining = state.remainingSeconds ?? 0;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>Tabula Rasa Alarm</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #050607; color: #f7fafc; }
    .alarm-screen { width: 100vw; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px; cursor: pointer; }
    .alarm-kicker { font-size: 20px; color: #9ca6b2; }
    .alarm-label { font-size: 64px; font-weight: 800; max-width: 86vw; text-align: center; overflow-wrap: anywhere; }
    .alarm-countdown { font-size: 34px; color: #9bd67d; }
  </style>
</head>
<body>
  <main class="alarm-screen" onclick="window.dismissAlarm && window.dismissAlarm()">
    <div class="alarm-kicker">接下来</div>
    <div class="alarm-label">${escapeHtml(label)}</div>
    <div class="alarm-countdown">${remaining}</div>
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
