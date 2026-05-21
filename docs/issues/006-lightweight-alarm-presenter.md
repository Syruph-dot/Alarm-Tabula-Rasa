# 006 - Lightweight Alarm Presenter

**Type**: AFK

**Status**: Implemented in MVP slice

**Blocked by**: 003 - Build Dynamic Free-Time Fill Engine

**User stories covered**: 10, 11, 12

## What to build

Add the end-to-end alarm path for soft-fill blocks. When a generated block ends, the app shows a fullscreen lightweight reminder with the next block label and a short countdown. The alarm should not ask the user to make scheduling decisions.

## Acceptance criteria

- [x] Scheduler can identify the next alarm from generated soft-fill blocks.
- [x] Fullscreen alarm shows the next item label and countdown.
- [x] Click-to-dismiss works when enabled.
- [x] Auto-dismiss works after the configured countdown.
- [x] Alarm does not show extend, skip, or reschedule controls.
- [x] Tests cover alarm state transitions and next-alarm selection.

## Implementation notes

- Core logic lives in `src/lib/alarm-presenter.js`.
- Main-window demo exposes `测试下一次提醒`, opening a fullscreen overlay for the next soft-fill transition.
- Alarm overlay has only next item label and countdown. No extend, skip, or reschedule controls.
- Click dismiss respects `settings.clickToDismiss`; auto-dismiss uses `settings.alarmSeconds`.

## Blocked by

- 003 - Build Dynamic Free-Time Fill Engine
