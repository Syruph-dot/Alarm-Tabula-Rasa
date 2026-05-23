import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeHardEvents,
  calculateFreeIntervals,
  rebuildFromNow,
  extendBlockAndReschedule,
  moveBlockEndAndReschedule,
  addBreakAndReschedule,
  applyRuntimeOverrides,
  chooseComparisonPair,
  selectItemForSlot,
} from '../src/prototypes/free-time-engine/engine.mjs';

const settings = {
  date: '2026-05-22',
  dayStart: '08:00',
  dayEnd: '23:00',
  minimumFillMinutes: 15,
  earlyEndCooldownMinutes: 180,
};

const fixedEvents = [
  {
    label: '开会',
    source: 'temporary',
    startTime: '2026-05-22T08:00:00+08:00',
    endTime: '2026-05-22T09:00:00+08:00',
  },
  {
    label: '高等数学Ⅱ',
    source: 'class',
    startTime: '2026-05-22T09:55:00+08:00',
    endTime: '2026-05-22T11:30:00+08:00',
  },
];

const reminderItems = [
  {
    id: 'item-a',
    label: '项目 A',
    defaultDurationMinutes: 30,
    active: true,
    importanceScore: 1500,
  },
  {
    id: 'item-b',
    label: '项目 B',
    defaultDurationMinutes: 30,
    active: true,
    importanceScore: 1400,
  },
];

function iso(value) {
  return value.toISOString();
}

describe('prototype free-time engine', () => {
  it('rebuilds from the supplied sample-day time instead of the host date', () => {
    const now = new Date('2026-05-22T09:10:00+08:00');
    const blocks = rebuildFromNow(fixedEvents, reminderItems, now, settings);

    assert.ok(blocks.length > 0);
    assert.equal(iso(blocks[0].start), now.toISOString());
    assert.ok(blocks.every(block => block.start >= now));
    assert.ok(blocks.every(block => block.start.toISOString().startsWith('2026-05-22')));
  });

  it('extends the active block and rebuilds subsequent blocks after the new end', () => {
    const merged = mergeHardEvents(fixedEvents);
    const free = calculateFreeIntervals(
      merged,
      new Date('2026-05-22T08:00:00+08:00'),
      new Date('2026-05-22T23:00:00+08:00'),
    );
    const blocks = rebuildFromNow(fixedEvents, reminderItems, new Date('2026-05-22T09:00:00+08:00'), settings);
    assert.equal(iso(blocks[0].start), new Date('2026-05-22T09:00:00+08:00').toISOString());
    assert.equal(iso(blocks[0].end), new Date('2026-05-22T09:30:00+08:00').toISOString());
    assert.ok(free.length > 0);

    const result = extendBlockAndReschedule(
      blocks,
      fixedEvents,
      reminderItems,
      new Date('2026-05-22T09:10:00+08:00'),
      15,
      settings,
    );

    assert.ok(result);
    assert.equal(iso(result.extendedBlock.end), new Date('2026-05-22T09:45:00+08:00').toISOString());
    assert.ok(result.subsequentBlocks.every(block => block.start >= result.extendedBlock.end));
  });

  it('does not extend a soft block across the next hard event', () => {
    const longReminder = [
      {
        id: 'item-long',
        label: '长项目',
        defaultDurationMinutes: 45,
        active: true,
        importanceScore: 1500,
      },
    ];
    const blocks = rebuildFromNow(fixedEvents, longReminder, new Date('2026-05-22T09:10:00+08:00'), settings);
    assert.equal(iso(blocks[0].start), new Date('2026-05-22T09:10:00+08:00').toISOString());
    assert.equal(iso(blocks[0].end), new Date('2026-05-22T09:55:00+08:00').toISOString());

    const result = extendBlockAndReschedule(
      blocks,
      fixedEvents,
      longReminder,
      new Date('2026-05-22T09:20:00+08:00'),
      15,
      settings,
    );

    assert.equal(result, null);
  });

  it('keeps runtime block extension when scores change and the future table is rebuilt', () => {
    const now = new Date('2026-05-22T09:10:00+08:00');
    const blocks = rebuildFromNow(fixedEvents, reminderItems, now, settings);
    const extended = extendBlockAndReschedule(
      blocks,
      fixedEvents,
      reminderItems,
      now,
      15,
      settings,
    );
    assert.ok(extended);

    const rebuilt = rebuildFromNow(
      applyRuntimeOverrides(fixedEvents, [extended.extendedBlock]),
      reminderItems.map(item => item.id === 'item-b' ? { ...item, importanceScore: 1700 } : item),
      now,
      settings,
    );

    assert.equal(iso(rebuilt[0].start), iso(extended.extendedBlock.start));
    assert.equal(iso(rebuilt[0].end), iso(extended.extendedBlock.end));
    assert.equal(rebuilt[0].runtimeLocked, true);
  });

  it('can move the active block end 15 minutes earlier and rebuild from the new end', () => {
    const now = new Date('2026-05-22T12:00:00+08:00');
    const blocks = rebuildFromNow(fixedEvents, reminderItems, new Date('2026-05-22T11:30:00+08:00'), settings);
    const result = moveBlockEndAndReschedule(
      blocks,
      fixedEvents,
      reminderItems,
      now,
      -15,
      settings,
    );

    assert.ok(result);
    assert.equal(iso(result.adjustedBlock.end), new Date('2026-05-22T12:15:00+08:00').toISOString());
    assert.ok(result.subsequentBlocks.every(block => block.start >= result.adjustedBlock.end));
    assert.notEqual(result.subsequentBlocks[0]?.itemId, result.adjustedBlock.itemId);
  });

  it('does not schedule an early-ended item during the configured cooldown window', () => {
    const now = new Date('2026-05-22T12:00:00+08:00');
    const blocks = rebuildFromNow(fixedEvents, reminderItems, new Date('2026-05-22T11:30:00+08:00'), settings);
    const result = moveBlockEndAndReschedule(
      blocks,
      fixedEvents,
      reminderItems,
      now,
      'now',
      settings,
    );

    assert.ok(result);
    const cooldownUntil = new Date('2026-05-22T15:00:00+08:00');
    const target = result.adjustedBlock ?? result.skippedBlock;
    assert.ok(target);
    assert.equal(result.cooldown.itemId, target.itemId);
    assert.equal(iso(result.cooldown.until), cooldownUntil.toISOString());
    assert.ok(result.subsequentBlocks.filter(block => block.start < cooldownUntil).every(block => block.itemId !== target.itemId));
    assert.ok(result.subsequentBlocks.some(block => block.start >= cooldownUntil && block.itemId === target.itemId));
  });

  it('uses the configured early-end cooldown length', () => {
    const now = new Date('2026-05-22T12:00:00+08:00');
    const blocks = rebuildFromNow(fixedEvents, reminderItems, new Date('2026-05-22T11:30:00+08:00'), settings);
    const result = moveBlockEndAndReschedule(
      blocks,
      fixedEvents,
      reminderItems,
      now,
      'now',
      { ...settings, earlyEndCooldownMinutes: 30 },
    );

    assert.ok(result);
    const target = result.adjustedBlock ?? result.skippedBlock;
    assert.ok(target);
    assert.equal(iso(result.cooldown.until), new Date('2026-05-22T12:30:00+08:00').toISOString());
    assert.ok(result.subsequentBlocks.filter(block => block.start < result.cooldown.until).every(block => block.itemId !== target.itemId));
    assert.ok(result.subsequentBlocks.some(block => block.start >= result.cooldown.until && block.itemId === target.itemId));
  });

  it('fills rest when all items are cooling down in a gap', () => {
    const gapStart = new Date('2026-05-22T12:00:00+08:00');
    const gapEnd = new Date('2026-05-22T13:00:00+08:00');
    const blocks = rebuildFromNow(
      [],
      reminderItems,
      gapStart,
      {
        ...settings,
        itemCooldowns: reminderItems.map(item => ({
          itemId: item.id,
          until: new Date('2026-05-22T15:00:00+08:00'),
        })),
      },
    ).filter(block => block.start < gapEnd && block.end > gapStart);

    assert.ok(blocks.length > 0);
    assert.ok(blocks.every(block => block.break));
    assert.ok(blocks.every(block => block.durationMinutes > 0));
  });

  it('can skip the next block at an exact boundary without creating a zero-minute block', () => {
    const now = new Date('2026-05-22T12:00:00+08:00');
    const blocks = rebuildFromNow(fixedEvents, reminderItems, new Date('2026-05-22T11:30:00+08:00'), settings);
    const first = moveBlockEndAndReschedule(blocks, fixedEvents, reminderItems, now, 'now', settings);
    assert.ok(first);

    const second = moveBlockEndAndReschedule(
      [first.adjustedBlock, ...first.subsequentBlocks],
      applyRuntimeOverrides(fixedEvents, [first.adjustedBlock]),
      reminderItems,
      now,
      'now',
      { ...settings, itemCooldowns: [first.cooldown] },
    );

    assert.ok(second);
    assert.equal(second.adjustedBlock, null);
    assert.ok(second.skippedBlock);
    assert.ok([first.adjustedBlock, ...second.subsequentBlocks].filter(Boolean).every(block => block.durationMinutes > 0));
    assert.ok(second.subsequentBlocks.some(block => block.break));
    assert.ok(second.subsequentBlocks.filter(block => block.start < first.cooldown.until).every(block => block.itemId !== first.cooldown.itemId));
    assert.ok(second.subsequentBlocks.filter(block => block.start < second.cooldown.until).every(block => block.itemId !== second.cooldown.itemId));
  });

  it('can stop the active block now and rebuild from now', () => {
    const now = new Date('2026-05-22T12:00:00+08:00');
    const blocks = rebuildFromNow(fixedEvents, reminderItems, new Date('2026-05-22T11:30:00+08:00'), settings);
    const result = moveBlockEndAndReschedule(
      blocks,
      fixedEvents,
      reminderItems,
      now,
      'now',
      settings,
    );

    assert.ok(result);
    const target = result.adjustedBlock ?? result.skippedBlock;
    assert.ok(target);
    assert.equal(result.cooldown.itemId, target.itemId);
    assert.equal(iso(result.cooldown.from), now.toISOString());
    assert.ok(result.subsequentBlocks.every(block => block.start >= now));
    assert.notEqual(result.subsequentBlocks[0]?.itemId, target.itemId);
  });

  it('replaces an existing runtime override when the same block is shortened later', () => {
    const now = new Date('2026-05-22T09:10:00+08:00');
    const blocks = rebuildFromNow(fixedEvents, reminderItems, now, settings);
    const extended = extendBlockAndReschedule(blocks, fixedEvents, reminderItems, now, 15, settings);
    assert.ok(extended);

    const effective = applyRuntimeOverrides(fixedEvents, [extended.extendedBlock]);
    const shortened = moveBlockEndAndReschedule(
      [extended.extendedBlock, ...extended.subsequentBlocks],
      effective,
      reminderItems,
      now,
      -15,
      settings,
    );

    assert.ok(shortened);
    const allBlocks = [shortened.adjustedBlock, ...shortened.subsequentBlocks];
    const sameStart = allBlocks.filter(block => iso(block.start) === iso(shortened.adjustedBlock.start));
    assert.equal(sameStart.length, 1);
    assert.equal(iso(sameStart[0].end), iso(shortened.adjustedBlock.end));
  });

  it('can insert a break block and rebuild after the break ends', () => {
    const now = new Date('2026-05-22T11:45:00+08:00');
    const blocks = rebuildFromNow(fixedEvents, reminderItems, new Date('2026-05-22T11:30:00+08:00'), settings);
    const result = addBreakAndReschedule(
      blocks,
      fixedEvents,
      reminderItems,
      now,
      15,
      settings,
    );

    assert.ok(result);
    assert.equal(result.breakBlock.label, '休息');
    assert.equal(iso(result.breakBlock.start), now.toISOString());
    assert.equal(iso(result.breakBlock.end), new Date('2026-05-22T12:00:00+08:00').toISOString());
    assert.equal(iso(result.completedBlock.end), now.toISOString());
    assert.ok(result.subsequentBlocks.every(block => block.start >= result.breakBlock.end));
    assert.notEqual(result.subsequentBlocks[0]?.itemId, result.completedBlock.itemId);
  });

  it('can insert a break when the current block is already a runtime override', () => {
    const now = new Date('2026-05-22T11:45:00+08:00');
    const blocks = rebuildFromNow(fixedEvents, reminderItems, now, settings);
    const extended = extendBlockAndReschedule(blocks, fixedEvents, reminderItems, now, 15, settings);
    assert.ok(extended);
    const effective = applyRuntimeOverrides(fixedEvents, [extended.extendedBlock]);

    const result = addBreakAndReschedule(
      [extended.extendedBlock, ...extended.subsequentBlocks],
      effective,
      reminderItems,
      now,
      15,
      settings,
    );

    assert.ok(result);
    assert.equal(iso(result.breakBlock.start), now.toISOString());
    assert.equal(iso(result.breakBlock.end), new Date('2026-05-22T12:00:00+08:00').toISOString());
    assert.ok(result.subsequentBlocks.every(block => block.start >= result.breakBlock.end));
  });

  it('samples pairwise comparisons across under-covered items instead of repeating one pair', () => {
    const items = [
      { id: 'a', label: 'A', active: true, importanceScore: 1500 },
      { id: 'b', label: 'B', active: true, importanceScore: 1490 },
      { id: 'c', label: 'C', active: true, importanceScore: 1480 },
      { id: 'd', label: 'D', active: true, importanceScore: 1470 },
      { id: 'e', label: 'E', active: true, importanceScore: 1460 },
    ];
    const history = [
      { at: '2026-05-22T10:00:00+08:00', leftItemId: 'a', rightItemId: 'b', choice: 'left' },
      { at: '2026-05-22T10:10:00+08:00', leftItemId: 'a', rightItemId: 'b', choice: 'right' },
      { at: '2026-05-22T10:20:00+08:00', leftItemId: 'a', rightItemId: 'b', choice: 'tie' },
    ];

    const pair = chooseComparisonPair(items, history, new Date('2026-05-22T12:00:00+08:00'));

    assert.ok(pair);
    assert.notDeepEqual([pair.left.id, pair.right.id].sort(), ['a', 'b']);
    assert.ok([pair.left.id, pair.right.id].some(id => ['c', 'd', 'e'].includes(id)));
  });

  it('selects soft-fill items with seeded softmax sampling instead of always taking the max score', () => {
    const items = [
      { id: 'high', label: 'High', active: true, importanceScore: 1600 },
      { id: 'mid', label: 'Mid', active: true, importanceScore: 1500 },
      { id: 'low', label: 'Low', active: true, importanceScore: 1400 },
    ];

    const chosen = selectItemForSlot(items, new Map(), 15, {
      random: () => 0.75,
      temperature: 120,
    });

    assert.equal(chosen.id, 'mid');
  });

  it('avoids immediately repeating the most recently compared pair when alternatives exist', () => {
    const items = [
      { id: 'a', label: 'A', active: true, importanceScore: 1500 },
      { id: 'b', label: 'B', active: true, importanceScore: 1495 },
      { id: 'c', label: 'C', active: true, importanceScore: 1490 },
    ];
    const history = [
      { at: '2026-05-22T11:59:00+08:00', leftItemId: 'a', rightItemId: 'b', choice: 'left' },
    ];

    const pair = chooseComparisonPair(items, history, new Date('2026-05-22T12:00:00+08:00'));

    assert.ok(pair);
    assert.notDeepEqual([pair.left.id, pair.right.id].sort(), ['a', 'b']);
  });
});
