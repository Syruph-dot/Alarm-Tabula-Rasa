// Pure runtime functions for the Reminder lifecycle.
// Due detection, snooze computation, and queue ordering.
// Composable with app-store.js CRUD and app-runtime.js start flow.

const DEFAULT_LOOKBACK_MS = 30000;
const CLOSE_SNOOZE_BASE = 12;
const CLOSE_SNOOZE_INCREMENT = 5;
const PRESET_MINUTES = Object.freeze([5, 10, 15, 30, 60]);

export function getSnoozePresets() {
  return PRESET_MINUTES;
}

export function checkDueReminders(store, now, lookbackMs = DEFAULT_LOOKBACK_MS) {
  const target = new Date(now);
  const lookback = new Date(target.getTime() - lookbackMs);

  return (store.reminders ?? [])
    .filter(reminder => {
      if (reminder.archivedAt) return false;
      if (reminder.status !== 'scheduled' && reminder.status !== 'snoozed') return false;
      const dueAt = new Date(reminder.dueAt);
      return dueAt >= lookback && dueAt <= target;
    })
    .sort((a, b) => {
      const dueCmp = new Date(a.dueAt) - new Date(b.dueAt);
      if (dueCmp !== 0) return dueCmp;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });
}

export function computeSnoozeDueAt(now, presetMinutes) {
  const base = new Date(now);
  return new Date(base.getTime() + presetMinutes * 60000);
}

export function computeCloseSnoozeMinutes(reminder) {
  return CLOSE_SNOOZE_BASE + (reminder.closeCount * CLOSE_SNOOZE_INCREMENT);
}

export function formatLocalDueAt(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${day}T${h}:${m}:00+08:00`;
}
