# 002 - Edit Hard Time And Reminder Items

**Type**: AFK

**Blocked by**: 001 - Bootstrap Sample Day View

**User stories covered**: 1, 2, 7

## What to build

Add the minimum editable path for the MVP data model: users can add fixed events, add reminder items, change a reminder item's default block length through preset choices, and hide or restore a reminder item.

This slice should keep interaction light: names can be typed, but time and duration should prefer click choices where practical.

## Acceptance criteria

- [ ] User can add a fixed event with name, start, and end.
- [ ] User can add a reminder item by name.
- [ ] User can choose default reminder duration from preset values.
- [ ] User can hide and restore a reminder item.
- [ ] Edits persist to the local JSON store and are reflected after restart.
- [ ] Tests cover validation for missing names, invalid time ranges, and hidden reminder exclusion.

## Blocked by

- 001 - Bootstrap Sample Day View
