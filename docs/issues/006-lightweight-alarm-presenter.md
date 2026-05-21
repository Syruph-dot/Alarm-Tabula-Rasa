# 006 - Lightweight Alarm Presenter

**Type**: AFK

**Blocked by**: 003 - Build Dynamic Free-Time Fill Engine

**User stories covered**: 10, 11, 12

## What to build

Add the end-to-end alarm path for soft-fill blocks. When a generated block ends, the app shows a fullscreen lightweight reminder with the next block label and a short countdown. The alarm should not ask the user to make scheduling decisions.

## Acceptance criteria

- [ ] Scheduler can identify the next alarm from generated soft-fill blocks.
- [ ] Fullscreen alarm shows the next item label and countdown.
- [ ] Click-to-dismiss works when enabled.
- [ ] Auto-dismiss works after the configured countdown.
- [ ] Alarm does not show extend, skip, or reschedule controls.
- [ ] Tests cover alarm state transitions and next-alarm selection.

## Blocked by

- 003 - Build Dynamic Free-Time Fill Engine
