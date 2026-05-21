# 005 - Pairwise Preference Sampler

**Type**: AFK

**Blocked by**: 002 - Edit Hard Time And Reminder Items; 003 - Build Dynamic Free-Time Fill Engine

**User stories covered**: 3, 4, 5, 7

## What to build

Build the lightweight pairwise preference widget. It should show two reminder items and ask the user for first-impression importance, not today's importance. Each click updates internal item data and can trigger a future table rebuild.

This slice includes candidate-pair selection, score updates, comparison history persistence, and a minimal UI entry point.

## Acceptance criteria

- [ ] Widget prompt says `第一印象：哪个更重要？`.
- [ ] User can choose left item, right item, tie, or skip.
- [ ] Left/right choices update item scores in opposite directions.
- [ ] Tie moves scores closer and increases confidence.
- [ ] Skip does not change scores and reduces short-term repeat of that pair.
- [ ] Candidate selection prefers useful comparisons: close scores, stale comparisons, and active unscheduled items.
- [ ] Future soft-fill table can be rebuilt after a comparison.
- [ ] Tests cover score update, tie behavior, skip behavior, and candidate selection.

## Blocked by

- 002 - Edit Hard Time And Reminder Items
- 003 - Build Dynamic Free-Time Fill Engine
