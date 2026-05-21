# 005 - Pairwise Preference Sampler

**Type**: AFK

**Status**: Implemented in MVP slice

**Blocked by**: 002 - Edit Hard Time And Reminder Items; 003 - Build Dynamic Free-Time Fill Engine

**User stories covered**: 3, 4, 5, 7

## What to build

Build the lightweight pairwise preference widget. It should show two reminder items and ask the user for first-impression importance, not today's importance. Each click updates internal item data and can trigger a future table rebuild.

This slice includes candidate-pair selection, score updates, comparison history persistence, and a minimal UI entry point.

## Acceptance criteria

- [x] Widget prompt says `第一印象：哪个更重要？`.
- [x] User can choose left item, right item, tie, or skip.
- [x] Left/right choices update item scores in opposite directions.
- [x] Tie moves scores closer and increases confidence.
- [x] Skip does not change scores and reduces short-term repeat of that pair.
- [x] Candidate selection prefers useful comparisons: close scores, stale comparisons, and active unscheduled items.
- [x] Future soft-fill table can be rebuilt after a comparison.
- [x] Tests cover score update, tie behavior, skip behavior, and candidate selection.

## Implementation notes

- Core sampler logic lives in `src/lib/preference-sampler.js`.
- `src/lib/day-planner.js` exposes `rebuildPlanAfterPreferenceChoice(...)` so a comparison can update item data and rebuild future soft-fill blocks.
- Main-window demo shows the current pair and supports left, right, tie, and skip clicks.
- Skip is stored in comparison history and penalizes that pair for the short term without changing reminder scores.

## Blocked by

- 002 - Edit Hard Time And Reminder Items
- 003 - Build Dynamic Free-Time Fill Engine
