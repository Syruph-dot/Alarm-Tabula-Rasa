# 001 - Bootstrap Sample Day View

**Type**: AFK

**Blocked by**: None - can start immediately

**User stories covered**: 1, 2, 6, 7

## What to build

Create the first runnable desktop app slice that loads local JSON data and renders a single day view for the sample date. The view must distinguish fixed events, temporary events, and generated soft-fill blocks so the user can see that hard time is stable while soft fill is dynamic.

The slice should include enough storage/schema wiring to load the sample data file, run the free-time fill path, and display the derived day structure in the main window.

## Acceptance criteria

- [ ] The app starts locally with one command.
- [ ] The sample day `2026-05-22` loads from local JSON.
- [ ] Fixed class events, the temporary meeting, and soft-fill blocks are visually distinguishable.
- [ ] Overlapping hard events are merged for free-time calculation.
- [ ] A basic automated test verifies the hard/free interval calculation against the sample data.

## Blocked by

None - can start immediately.
