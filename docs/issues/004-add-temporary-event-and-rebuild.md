# 004 - Add Temporary Event And Rebuild Future Table

**Type**: AFK

**Blocked by**: 002 - Edit Hard Time And Reminder Items; 003 - Build Dynamic Free-Time Fill Engine

**User stories covered**: 8, 9

## What to build

Add the user path for quickly inserting a temporary event, then rebuild only the future soft-fill table. This should support the MVP demo case: Friday `2026-05-22` 08:00-09:00 temporary event named `开会`.

The interaction should be tray-accessible eventually, but this slice may start with a main-window path if the tray shell is not complete yet.

## Acceptance criteria

- [ ] User can add a temporary event with name, start choice, and preset duration.
- [ ] A temporary event is stored as hard time with `source: "temporary"`.
- [ ] Adding the event does not rewrite past blocks.
- [ ] Future soft-fill blocks are regenerated after insertion.
- [ ] The sample meeting `开会` from 08:00 to 09:00 can be represented exactly.
- [ ] Tests cover temporary event insertion before, during, and after existing hard intervals.

## Blocked by

- 002 - Edit Hard Time And Reminder Items
- 003 - Build Dynamic Free-Time Fill Engine
