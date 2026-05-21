# 003 - Build Dynamic Free-Time Fill Engine

**Type**: AFK

**Blocked by**: 001 - Bootstrap Sample Day View

**User stories covered**: 5, 6, 7, 9

## What to build

Implement the production version of the free-time engine. Given hard events, active reminder items, current time, and settings, it should produce future soft-fill blocks that can change whenever inputs or scores change.

The engine should treat generated tables as cache, not source of truth. It should prioritize dynamic item data, avoid immediate repetition, and allow blocks to be shortened when a gap is smaller than the item's default duration but still above the minimum fill length.

## Acceptance criteria

- [ ] Engine accepts hard events, reminder items, settings, and current time.
- [ ] Engine only generates soft-fill blocks after the current time.
- [ ] Blocks respect hard event boundaries.
- [ ] Blocks can shrink to the configured minimum fill length.
- [ ] Recently scheduled items are cooled down enough to avoid obvious repetition.
- [ ] Long-unseen active items receive a small compensation without becoming mandatory.
- [ ] Unit tests cover empty day, class-only day, overlapping hard events, short gaps, cooldown, and compensation.

## Blocked by

- 001 - Bootstrap Sample Day View
