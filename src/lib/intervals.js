export function mergeHardEvents(events) {
  if (events.length === 0) return [];

  const parsed = events.map(e => ({
    start: new Date(e.startTime),
    end: new Date(e.endTime),
    label: e.label,
    source: e.source,
  }));

  parsed.sort((a, b) => a.start - b.start);

  const merged = [];
  for (const ev of parsed) {
    if (merged.length === 0 || ev.start > merged.at(-1).end) {
      merged.push({ start: ev.start, end: ev.end, labels: [ev.label], sources: [ev.source] });
    } else {
      merged.at(-1).end = ev.end > merged.at(-1).end ? ev.end : merged.at(-1).end;
      merged.at(-1).labels.push(ev.label);
      merged.at(-1).sources.push(ev.source);
    }
  }

  return merged;
}

export function calculateFreeIntervals(mergedEvents, dayStart, dayEnd) {
  const free = [];
  let cursor = dayStart;

  for (const ev of mergedEvents) {
    if (ev.start > cursor) {
      free.push({ start: cursor, end: ev.start });
    }
    if (ev.end > cursor) {
      cursor = ev.end;
    }
  }

  if (cursor < dayEnd) {
    free.push({ start: cursor, end: dayEnd });
  }

  return free;
}
