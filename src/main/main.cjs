const { app, BrowserWindow } = require('electron');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

// Inline interval logic — reused from src/lib/intervals.js (ESM)
function mergeHardEvents(events) {
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

function calculateFreeIntervals(mergedEvents, dayStart, dayEnd) {
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

const samplePath = resolve(__dirname, '..', '..', 'docs', 'sample-data', 'free-time-sample-2026-05-22.json');

function loadDayData() {
  const raw = JSON.parse(readFileSync(samplePath, 'utf-8'));
  const date = raw.metadata.date;
  const events = raw.fixedEvents[date];
  const merged = mergeHardEvents(events);
  const dayStart = new Date(`${date}T${raw.settings.dayStart}:00+08:00`);
  const dayEnd = new Date(`${date}T${raw.settings.dayEnd}:00+08:00`);
  const free = calculateFreeIntervals(merged, dayStart, dayEnd);
  return { date, merged, free, reminderItems: raw.reminderItems, settings: raw.settings };
}

function fmt(d) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function timeToRow(d) {
  const h = d.getHours();
  const m = d.getMinutes();
  return Math.round((h - 8) * 2 + m / 30) + 1;
}

function renderHTML(data) {
  const hardHtml = data.merged.map(ev => `
    <div class="event hard" style="grid-row: ${timeToRow(ev.start)} / ${timeToRow(ev.end)}">
      <span class="time">${fmt(ev.start)}–${fmt(ev.end)}</span>
      <span class="label">${ev.labels.join(', ')}</span>
      <span class="source">${ev.sources.join(', ')}</span>
    </div>
  `).join('\n');

  const freeHtml = data.free.map(f => `
    <div class="event free" style="grid-row: ${timeToRow(f.start)} / ${timeToRow(f.end)}">
      <span class="time">${fmt(f.start)}–${fmt(f.end)}</span>
      <span class="label">空闲</span>
    </div>
  `).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>Tabula Rasa — ${data.date}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, 'Segoe UI', sans-serif; background: #1a1a2e; color: #eee; padding: 16px; }
    h1 { font-size: 18px; margin-bottom: 12px; color: #a0a0c0; }
    .timeline { display: grid; grid-template-rows: repeat(60, 24px); gap: 1px; position: relative; }
    .event { border-radius: 6px; padding: 4px 8px; overflow: hidden; display: flex; flex-direction: column; justify-content: center; margin: 1px 0; }
    .event.hard { background: #3a3a5c; border-left: 3px solid #7c7cf0; }
    .event.free { background: #1e3a2e; border-left: 3px solid #4caf50; }
    .event .time { font-size: 11px; color: #888; }
    .event .label { font-size: 14px; font-weight: 500; }
    .event .source { font-size: 10px; color: #666; }
    .legend { display: flex; gap: 16px; margin: 16px 0; font-size: 13px; }
    .legend-item { display: flex; align-items: center; gap: 4px; }
    .legend-dot { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
    .legend-dot.hard { background: #7c7cf0; }
    .legend-dot.free { background: #4caf50; }
  </style>
</head>
<body>
  <h1>📅 ${data.date} — 日视图</h1>
  <div class="legend">
    <span class="legend-item"><span class="legend-dot hard"></span> 固定 / 临时</span>
    <span class="legend-item"><span class="legend-dot free"></span> 空闲</span>
  </div>
  <div class="timeline">
    ${hardHtml}
    ${freeHtml}
  </div>
</body>
</html>`;
}

function createWindow() {
  const data = loadDayData();
  const win = new BrowserWindow({
    width: 600,
    height: 900,
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(renderHTML(data))}`);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
