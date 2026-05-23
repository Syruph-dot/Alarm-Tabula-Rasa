// PROTOTYPE — free-time fill engine logic.
// Portable pure functions. No I/O. Liftable into production later.

const NAME_PIN_SOURCES = new Set(['runtime-lock', 'project-pick']);

export function isNamePinEvent(event) {
  return NAME_PIN_SOURCES.has(event?.source);
}

export function mergeHardEvents(events) {
  if (events.length === 0) return [];
  const parsed = events.filter(event => !isNamePinEvent(event)).map(e => ({
    start: new Date(e.startTime),
    end: new Date(e.endTime),
    labels: [e.label],
    sources: [e.source],
    runtimeBlocks: e.runtimeBlock ? [{
      ...e.runtimeBlock,
      lockedEventId: e.runtimeBlock.lockedEventId ?? e.id,
      lockedEventSource: e.runtimeBlock.lockedEventSource ?? e.source,
      runtimeLocked: e.runtimeBlock.runtimeLocked ?? true,
    }] : [],
  }));
  if (parsed.length === 0) return [];
  parsed.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const ev of parsed) {
    if (merged.length === 0 || ev.start > merged.at(-1).end) {
      merged.push({
        start: ev.start,
        end: ev.end,
        labels: [...ev.labels],
        sources: [...ev.sources],
        runtimeBlocks: [...ev.runtimeBlocks],
      });
    } else {
      merged.at(-1).end = ev.end > merged.at(-1).end ? ev.end : merged.at(-1).end;
      merged.at(-1).labels.push(...ev.labels);
      merged.at(-1).sources.push(...ev.sources);
      merged.at(-1).runtimeBlocks.push(...ev.runtimeBlocks);
    }
  }
  return merged;
}

export function calculateFreeIntervals(merged, dayStart, dayEnd) {
  const free = [];
  let cursor = dayStart;
  for (const ev of merged) {
    if (ev.start > cursor) free.push({ start: cursor, end: ev.start });
    if (ev.end > cursor) cursor = ev.end;
  }
  if (cursor < dayEnd) free.push({ start: cursor, end: dayEnd });
  return free;
}

function runtimeBlocksFromMerged(merged) {
  return merged.flatMap(event => event.runtimeBlocks ?? []);
}

function courseBlocksFromEvents(events, effectiveStart, existingRuntimeBlocks) {
  return events
    .filter(event => event.source === 'course-import' && new Date(event.endTime) > effectiveStart)
    .filter(event => !existingRuntimeBlocks.some(rb => {
      const eventStart = new Date(event.startTime);
      const eventEnd = new Date(event.endTime);
      return rb.start < eventEnd && rb.end > eventStart;
    }))
    .map(event => ({
      itemId: `course-${event.id}`,
      label: event.label,
      start: new Date(event.startTime),
      end: new Date(event.endTime),
      durationMinutes: (new Date(event.endTime) - new Date(event.startTime)) / 60000,
      score: 0,
      courseBlock: true,
      runtimeLocked: true,
      lockedEventId: event.id,
      lockedEventSource: 'course-import',
    }));
}

function namePinsAfter(events, effectiveStart) {
  return events
    .filter(event => isNamePinEvent(event) && event.runtimeBlock && new Date(event.endTime) > effectiveStart)
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
}

function overlapMs(block, pin) {
  const start = Math.max(new Date(block.start).getTime(), new Date(pin.startTime).getTime());
  const end = Math.min(new Date(block.end).getTime(), new Date(pin.endTime).getTime());
  return Math.max(0, end - start);
}

function applyNamePins(blocks, pins) {
  if (pins.length === 0 || blocks.length === 0) return blocks;
  const next = blocks.map(block => ({ ...block }));

  for (const pin of pins) {
    let bestIndex = -1;
    let bestOverlap = 0;
    for (let index = 0; index < next.length; index += 1) {
      const currentOverlap = overlapMs(next[index], pin);
      if (currentOverlap > bestOverlap) {
        bestIndex = index;
        bestOverlap = currentOverlap;
      }
    }
    if (bestIndex < 0) continue;
    const pinned = pin.runtimeBlock;
    next[bestIndex] = {
      ...next[bestIndex],
      itemId: pinned.itemId ?? next[bestIndex].itemId,
      label: pinned.label ?? pin.label,
      runtimeLocked: true,
      lockedEventId: pin.id,
      lockedEventSource: pin.source,
      ...(pinned.oneOff ? { oneOff: true } : {}),
    };
  }

  return next;
}

export function selectItemForSlot(items, scheduledCounts, minFillMinutes, options = {}) {
  const active = items.filter(i => i.active);
  if (active.length === 0) return null;

  // Score = importanceScore - cooldown × recently-scheduled penalty
  const scored = active.map(item => {
    const count = scheduledCounts.get(item.id) ?? 0;
    const cooldownPenalty = count * 80;
    return { item, score: item.importanceScore - cooldownPenalty };
  });

  const random = options.random ?? (() => 0);
  const temperature = Math.max(1, Number(options.temperature ?? options.softmaxTemperature ?? 80));
  const maxScore = Math.max(...scored.map(entry => entry.score));
  const weighted = scored.map(entry => ({
    ...entry,
    weight: Math.exp((entry.score - maxScore) / temperature),
  })).sort((a, b) => b.weight - a.weight);
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
    scored.sort((a, b) => b.score - a.score);
    return scored[0].item;
  }

  let threshold = Math.min(0.999999999999, Math.max(0, random())) * totalWeight;
  for (const entry of weighted) {
    threshold -= entry.weight;
    if (threshold <= 0) return entry.item;
  }
  return weighted.at(-1).item;
}

function isCooldownActive(cooldown, slotStart) {
  const from = cooldown.from ? new Date(cooldown.from) : null;
  const until = new Date(cooldown.until);
  return (!from || slotStart >= from) && slotStart < until;
}

function isItemCoolingDown(itemId, slotStart, cooldowns) {
  return (cooldowns ?? []).some(cooldown => (
    cooldown.itemId === itemId && isCooldownActive(cooldown, slotStart)
  ));
}

function nextCooldownEndAfter(slotStart, gapEnd, cooldowns) {
  const ends = (cooldowns ?? [])
    .filter(cooldown => isCooldownActive(cooldown, slotStart))
    .map(cooldown => new Date(cooldown.until))
    .filter(until => until > slotStart && until < gapEnd)
    .sort((a, b) => a - b);
  return ends[0] ?? gapEnd;
}

function makeBreakBlock(start, end, reason = 'no-available-item') {
  return {
    itemId: `runtime-break-${start.getTime()}`,
    label: '休息',
    start: new Date(start),
    end: new Date(end),
    durationMinutes: (end - start) / 60000,
    score: 0,
    break: true,
    breakReason: reason,
  };
}

export function fillFreeIntervals(freeIntervals, personalProjects, settings) {
  const blocks = [];
  const scheduledCounts = new Map();
  const minFill = settings.minimumFillMinutes ?? 15;
  const suppressFirstItemIds = new Set(settings.suppressFirstItemIds ?? []);
  const cooldowns = settings.itemCooldowns ?? [];
  let firstSlot = true;

  for (const gap of freeIntervals) {
    let cursor = gap.start;
    while (cursor < gap.end) {
      const remainingMin = (gap.end - cursor) / 60000;
      if (remainingMin < minFill) break;

      const availableItems = firstSlot && suppressFirstItemIds.size > 0
        ? personalProjects.filter(item => !suppressFirstItemIds.has(item.id))
        : personalProjects;
      const filteredItems = availableItems.filter(item => !isItemCoolingDown(item.id, cursor, cooldowns));
      const chosen = selectItemForSlot(filteredItems, scheduledCounts, minFill, settings);
      if (!chosen) {
        const breakEnd = nextCooldownEndAfter(cursor, gap.end, cooldowns);
        if (breakEnd <= cursor) break;
        blocks.push(makeBreakBlock(cursor, breakEnd));
        firstSlot = false;
        cursor = breakEnd;
        continue;
      }

      const duration = Math.min(chosen.defaultDurationMinutes ?? 30, remainingMin);
      if (duration < minFill) break;

      const blockEnd = new Date(cursor.getTime() + duration * 60000);
      scheduledCounts.set(chosen.id, (scheduledCounts.get(chosen.id) ?? 0) + 1);

      blocks.push({
        itemId: chosen.id,
        label: chosen.label,
        start: new Date(cursor),
        end: blockEnd,
        durationMinutes: duration,
        score: chosen.importanceScore,
      });
      firstSlot = false;
      cursor = blockEnd;
    }
  }
  return blocks;
}

export function rebuildFromNow(fixedEvents, personalProjects, now, settings) {
  const dateStr = settings.date ?? now.toISOString().slice(0, 10);
  const futureEvents = fixedEvents.filter(e => new Date(e.endTime) > now);
  const merged = mergeHardEvents(futureEvents);
  const dayStart = new Date(`${dateStr}T${settings.dayStart}:00+08:00`);
  const dayEnd = new Date(`${dateStr}T${settings.dayEnd}:00+08:00`);

  // Clip dayStart to now if now is past dayStart
  const effectiveStart = now > dayStart ? now : dayStart;
  const free = calculateFreeIntervals(merged, effectiveStart, dayEnd);
  const runtimeBlocks = runtimeBlocksFromMerged(merged).filter(block => block.end > effectiveStart);
  const courseBlocks = courseBlocksFromEvents(futureEvents, effectiveStart, runtimeBlocks);
  const generated = fillFreeIntervals(free, personalProjects, settings);
  return applyNamePins(
    [...runtimeBlocks, ...courseBlocks, ...generated].sort((a, b) => a.start - b.start),
    namePinsAfter(futureEvents, effectiveStart),
  );
}

function findTargetBlock(blocks, now) {
  const validBlocks = blocks.filter(block => block?.start && block?.end);
  const idx = validBlocks.findIndex(b => b.start <= now && b.end > now);
  const targetIdx = idx >= 0 ? idx : validBlocks.findIndex(b => b.start > now);
  if (targetIdx < 0) return null;
  return validBlocks[targetIdx];
}

function nextHardStartAfter(fixedEvents, targetEnd) {
  return fixedEvents
    .map(event => new Date(event.startTime))
    .filter(start => start >= targetEnd)
    .sort((a, b) => a - b)[0];
}

function nextNonRuntimeHardStartAfter(fixedEvents, targetEnd) {
  return fixedEvents
    .filter(event => !event.runtimeBlock)
    .map(event => new Date(event.startTime))
    .filter(start => start >= targetEnd)
    .sort((a, b) => a - b)[0];
}

function runtimeEventFromBlock(block) {
  return {
    startTime: block.start.toISOString(),
    endTime: block.end.toISOString(),
    label: block.label,
    source: 'runtime',
    runtimeBlock: block,
  };
}

function overlapsTarget(event, target) {
  if (!event.runtimeBlock) return false;
  const start = new Date(event.startTime);
  const end = new Date(event.endTime);
  return start < target.end && end > target.start;
}

export function applyRuntimeOverrides(fixedEvents, blocks) {
  return [
    ...fixedEvents,
    ...blocks
      .filter(block => block?.start && block?.end && block.end > block.start)
      .map(block => runtimeEventFromBlock({ ...block, runtimeLocked: true })),
  ];
}

// Extend the current (or next) block by extraMinutes, then reschedule everything after it.
// Returns { extendedBlock, subsequentBlocks } or null if no block to extend.
export function extendBlockAndReschedule(blocks, fixedEvents, personalProjects, now, extraMinutes, settings) {
  const target = findTargetBlock(blocks, now);
  if (!target) return null;

  const requestedEnd = new Date(target.end.getTime() + extraMinutes * 60000);
  const nextHardStart = nextHardStartAfter(fixedEvents, target.end);
  const newEnd = nextHardStart && requestedEnd > nextHardStart ? nextHardStart : requestedEnd;
  if (newEnd <= target.end) return null;

  const extended = {
    ...target, end: newEnd,
    durationMinutes: target.durationMinutes + ((newEnd - target.end) / 60000),
    extended: true,
    runtimeLocked: true,
  };

  const combined = applyRuntimeOverrides(
    fixedEvents.filter(event => !overlapsTarget(event, target)),
    [extended],
  );
  const subsequent = rebuildFromNow(combined, personalProjects, newEnd, settings);

  return { extendedBlock: extended, subsequentBlocks: subsequent };
}

export function moveBlockEndAndReschedule(blocks, fixedEvents, personalProjects, now, move, settings) {
  const target = findTargetBlock(blocks, now);
  if (!target) return null;

  const requestedEnd = move === 'now'
    ? new Date(now)
    : new Date(target.end.getTime() + move * 60000);
  const minEnd = target.start > now ? target.start : now;
  const newEnd = requestedEnd < minEnd ? minEnd : requestedEnd;
  if (newEnd >= target.end) return null;

  const adjusted = newEnd > target.start
    ? {
        ...target,
        end: newEnd,
        durationMinutes: (newEnd - target.start) / 60000,
        extended: false,
        shortened: true,
        runtimeLocked: true,
      }
    : null;
  const combined = applyRuntimeOverrides(
    fixedEvents.filter(event => !overlapsTarget(event, target)),
    adjusted ? [adjusted] : [],
  );
  const cooldownMinutes = settings.earlyEndCooldownMinutes ?? 180;
  const cooldown = {
    itemId: target.itemId,
    from: new Date(newEnd),
    until: new Date(newEnd.getTime() + cooldownMinutes * 60000),
    reason: 'early-end',
  };
  const subsequent = rebuildFromNow(
    combined,
    personalProjects,
    newEnd,
    {
      ...settings,
      suppressFirstItemIds: [target.itemId],
      itemCooldowns: [...(settings.itemCooldowns ?? []), cooldown],
    },
  );

  return {
    adjustedBlock: adjusted,
    skippedBlock: adjusted ? null : target,
    cooldown,
    subsequentBlocks: subsequent,
  };
}

export function addBreakAndReschedule(blocks, fixedEvents, personalProjects, now, minutes, settings) {
  const current = findTargetBlock(blocks, now);
  const completedBlock = current && current.start < now && current.end > now
    ? {
        ...current,
        end: new Date(now),
        durationMinutes: (now - current.start) / 60000,
        extended: false,
        shortened: true,
        runtimeLocked: true,
      }
    : null;

  const nextHardStart = nextNonRuntimeHardStartAfter(fixedEvents, now);
  const requestedEnd = new Date(now.getTime() + minutes * 60000);
  const end = nextHardStart && requestedEnd > nextHardStart ? nextHardStart : requestedEnd;
  if (end <= now) return null;

  const breakBlock = {
    ...makeBreakBlock(now, end, 'requested-break'),
    runtimeLocked: true,
  };

  const runtimeBlocks = completedBlock ? [completedBlock, breakBlock] : [breakBlock];
  const combined = applyRuntimeOverrides(
    fixedEvents.filter(event => !overlapsTarget(event, breakBlock) && (!completedBlock || !overlapsTarget(event, completedBlock))),
    runtimeBlocks,
  );
  const suppressFirstItemIds = current?.itemId ? [current.itemId] : [];
  const subsequent = rebuildFromNow(
    combined,
    personalProjects,
    end,
    { ...settings, suppressFirstItemIds },
  );

  return { completedBlock, breakBlock, subsequentBlocks: subsequent };
}

// Simple Elo-like update
const K = 32;
export function applyComparison(items, leftId, rightId, choice) {
  return items.map(item => {
    if (item.id !== leftId && item.id !== rightId) return item;
    const isLeft = item.id === leftId;
    const opponent = items.find(i => i.id === (isLeft ? rightId : leftId));
    if (!opponent) return item;

    const expected = 1 / (1 + Math.pow(10, (opponent.importanceScore - item.importanceScore) / 400));
    const result = choice === 'left' ? (isLeft ? 1 : 0)
                 : choice === 'right' ? (isLeft ? 0 : 1)
                 : 0.5; // tie

    const scoreChange = Math.round(K * (result - expected));
    return {
      ...item,
      importanceScore: Math.max(0, item.importanceScore + scoreChange),
      confidence: Math.min(1, (item.confidence ?? 0) + (choice === 'tie' ? 0.05 : 0.02)),
      lastComparedAt: new Date().toISOString(),
    };
  });
}

function pairKey(a, b) {
  return [a, b].sort().join('::');
}

function minutesSince(value, now) {
  if (!value) return Infinity;
  return Math.max(0, (now - new Date(value)) / 60000);
}

export function chooseComparisonPair(items, history = [], now = new Date()) {
  const active = items.filter(item => item.active);
  if (active.length < 2) return null;

  const itemCounts = new Map(active.map(item => [item.id, 0]));
  const pairStats = new Map();
  for (const entry of history) {
    if (!entry.leftItemId || !entry.rightItemId) continue;
    itemCounts.set(entry.leftItemId, (itemCounts.get(entry.leftItemId) ?? 0) + 1);
    itemCounts.set(entry.rightItemId, (itemCounts.get(entry.rightItemId) ?? 0) + 1);
    const key = pairKey(entry.leftItemId, entry.rightItemId);
    const stat = pairStats.get(key) ?? { count: 0, lastAt: null };
    stat.count += 1;
    if (!stat.lastAt || new Date(entry.at) > new Date(stat.lastAt)) stat.lastAt = entry.at;
    pairStats.set(key, stat);
  }

  const pairs = [];
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const left = active[i];
      const right = active[j];
      const key = pairKey(left.id, right.id);
      const stat = pairStats.get(key) ?? { count: 0, lastAt: null };
      const leftCount = itemCounts.get(left.id) ?? 0;
      const rightCount = itemCounts.get(right.id) ?? 0;
      const coverageBonus = 220 / (1 + leftCount + rightCount);
      const uncertaintyBonus = (1 - (left.confidence ?? 0)) * 30 + (1 - (right.confidence ?? 0)) * 30;
      const closenessBonus = Math.max(0, 120 - Math.abs((left.importanceScore ?? 0) - (right.importanceScore ?? 0)));
      const repeatPenalty = stat.count * 90;
      const recencyPenalty = minutesSince(stat.lastAt, now) < 60 ? 300 : 0;

      pairs.push({
        left,
        right,
        score: coverageBonus + uncertaintyBonus + closenessBonus - repeatPenalty - recencyPenalty,
        reason: {
          coverageBonus,
          uncertaintyBonus,
          closenessBonus,
          repeatPenalty,
          recencyPenalty,
          previousComparisons: stat.count,
        },
      });
    }
  }

  pairs.sort((a, b) => b.score - a.score);
  return pairs[0] ?? null;
}

export function fmtTime(d) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function minutesBetween(a, b) {
  return (b - a) / 60000;
}
