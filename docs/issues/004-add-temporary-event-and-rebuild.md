# 004 - Add Temporary Event And Rebuild Future Table

**Type**: AFK

**Status**: Implemented in MVP slice

**Blocked by**: 002 - Edit Hard Time And Reminder Items; 003 - Build Dynamic Free-Time Fill Engine

**User stories covered**: 8, 9

## What to build

Add the user path for quickly inserting a temporary event, then rebuild only the future soft-fill table. This should support the MVP demo case: Friday `2026-05-22` 08:00-09:00 temporary event named `开会`.

The interaction should be tray-accessible eventually, but this slice may start with a main-window path if the tray shell is not complete yet.

## Acceptance criteria

- [x] User can add a temporary event with name, start choice, and preset duration.
- [x] A temporary event is stored as hard time with `source: "temporary"`.
- [x] Adding the event does not rewrite past blocks.
- [x] Future soft-fill blocks are regenerated after insertion.
- [x] The sample meeting `开会` from 08:00 to 09:00 can be represented exactly.
- [x] Tests cover temporary event insertion before, during, and after existing hard intervals.

## Implementation notes

- Core logic lives in `src/lib/day-planner.js`.
- Main-window demo path exposes click presets for temporary meetings and rebuilds the view in memory.
- Duplicate generated temporary-event IDs are replaced rather than appended.
- Adding, deleting, hiding, or restoring reminder items stays in issue 002. This issue only covers temporary hard-time insertion and future soft-fill regeneration.

## Blocked by

- 002 - Edit Hard Time And Reminder Items
- 003 - Build Dynamic Free-Time Fill Engine
