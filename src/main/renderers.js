import {
  COURSE_TABLE_AI_PROMPT,
  COURSE_TABLE_WEEKLY_SCHEMA_ID,
} from '../lib/course-table-import.js';
import {
  DEFAULT_TRANSITION_SETTINGS,
  transitionEffectsByGroup,
} from '../lib/transition-effects.js';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function jsValue(value) {
  return esc(JSON.stringify(value ?? ''));
}

function isoLocalInput(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}`;
}

function time(value) {
  const d = value instanceof Date ? value : new Date(value);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function durationMinutes(start, end) {
  return Math.max(0, Math.round((new Date(end) - new Date(start)) / 60000));
}

function blockTimeState(block, now) {
  if (!now || !block?.start || !block?.end) return 'future';
  const currentNow = now instanceof Date ? now : new Date(now);
  const start = block.start instanceof Date ? block.start : new Date(block.start);
  const end = block.end instanceof Date ? block.end : new Date(block.end);
  if (end <= currentNow) return 'past';
  if (start <= currentNow && currentNow < end) return 'current';
  return 'future';
}

function currentDayPlanBlock(blocks = [], now = null) {
  return blocks.find(block => blockTimeState(block, now) === 'current') ?? null;
}

function nextDayPlanBlock(blocks = [], now = null) {
  if (!now) return blocks[0] ?? null;
  const currentNow = now instanceof Date ? now : new Date(now);
  return blocks.find(block => block?.start && new Date(block.start) > currentNow) ?? null;
}

function planBlockFromSoft(block) {
  const source = block.lockedEventSource ?? null;
  const isCourse = block.courseBlock === true;
  return {
    itemId: block.itemId,
    fixedEventId: isCourse ? null : (block.lockedEventId ?? null),
    lockedEventSource: source,
    start: block.start,
    end: block.end,
    label: block.label,
    durationMinutes: block.durationMinutes ?? durationMinutes(block.start, block.end),
    break: block.break,
    courseBlock: isCourse || undefined,
    source: 'soft',
    locked: block.runtimeLocked === true && ['runtime-lock', 'project-pick'].includes(source),
  };
}

function planBlockFromFixed(event) {
  const source = event.source ?? 'fixed';
  return {
    fixedEventId: event.id,
    lockedEventSource: source,
    itemId: event.runtimeBlock?.itemId ?? null,
    source,
    start: event.startTime,
    end: event.endTime,
    label: event.label,
    durationMinutes: durationMinutes(event.startTime, event.endTime),
    locked: ['runtime-lock', 'project-pick'].includes(source),
  };
}

function combinedDayPlanBlocks(view) {
  const softBlocks = (view.softFillBlocks ?? []).map(planBlockFromSoft);
  const softLockIds = new Set(softBlocks.map(block => block.fixedEventId).filter(Boolean));
  const courseBlockEventIds = new Set(
    (view.softFillBlocks ?? [])
      .filter(b => b.courseBlock && b.lockedEventId)
      .map(b => b.lockedEventId),
  );
  return [
    ...softBlocks,
    ...(view.fixedEvents ?? [])
      .filter(event => {
        if (event.runtimeBlock && softLockIds.has(event.id)) return false;
        if (courseBlockEventIds.has(event.id)) return false;
        return true;
      })
      .map(planBlockFromFixed),
  ].sort((a, b) => new Date(a.start) - new Date(b.start));
}

function shell({ title, body, script = '', compact = false }) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #111418; color: #eef2f6; }
    body.compact { width: 100vw; min-height: 100vh; overflow: hidden; }
    main { padding: ${compact ? '12px' : '18px'}; }
    h1 { margin: 0; font-size: 20px; letter-spacing: 0; }
    h2 { margin: 0 0 10px; font-size: 15px; letter-spacing: 0; color: #f5f7fa; }
    button, input, select { font: inherit; }
    button { border: 1px solid #384353; background: #202832; color: #f4f7fb; border-radius: 6px; padding: 7px 10px; cursor: pointer; }
    button:hover { background: #2a3442; border-color: #6a7a90; }
    input, select { width: 100%; border: 1px solid #384353; background: #151b22; color: #f4f7fb; border-radius: 6px; padding: 7px 8px; }
    textarea { width: 100%; min-height: 132px; resize: vertical; border: 1px solid #384353; background: #151b22; color: #f4f7fb; border-radius: 6px; padding: 8px; font: 12px ui-monospace, SFMono-Regular, Consolas, monospace; line-height: 1.45; }
    label { display: grid; gap: 4px; color: #b8c1ce; font-size: 12px; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 14px; }
    .meta { color: #96a1ae; font-size: 12px; line-height: 1.5; }
    .message { min-height: 18px; margin-bottom: 12px; color: #9bd67d; font-size: 12px; }
    .grid { display: grid; grid-template-columns: minmax(300px, 1fr) minmax(300px, 420px); gap: 14px; align-items: start; }
    .section { border-top: 1px solid #2a333f; padding-top: 12px; margin-top: 12px; }
    .panel { background: #171d24; border: 1px solid #29323e; border-radius: 8px; padding: 12px; }
    .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .fields.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .list { display: grid; gap: 7px; }
    .item { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; border: 1px solid #29323e; border-radius: 6px; padding: 8px; background: #13191f; }
    .item small { color: #94a0ad; }
    .hero-status { display: grid; gap: 8px; padding: 12px; border-radius: 8px; background: #141a21; border: 1px solid #2c3744; margin-bottom: 10px; }
    .hero-status strong { font-size: 16px; }
    .timeline { display: grid; gap: 6px; }
    .block-wrap { position: relative; overflow: hidden; border-radius: 6px; background: #24303c; }
    .block-actions { position: absolute; top: 0; right: 0; bottom: 0; display: flex; align-items: stretch; gap: 1px; opacity: 0; pointer-events: none; transition: opacity 160ms ease; }
    .block-wrap.actions-visible .block-actions { opacity: 1; pointer-events: auto; }
    .block-actions button { width: 54px; border-radius: 0; border: 0; background: #46586b; }
    .block-actions button.locked { background: #2f3a46; color: #9ca8b5; }
    .block { position: relative; z-index: 1; display: grid; grid-template-columns: 84px 1fr auto; gap: 8px; align-items: center; padding: 8px; border-radius: 6px; background: #18202a; border-left: 3px solid #657385; transition: transform 180ms ease; }
    .block-wrap.actions-visible .block { transform: translateX(-56px); }
    .block.break { background: #272318; border-left-color: #d5ad4c; }
    .block.past { background: #23272d; border-left-color: #7a828c; color: #b8c1cb; }
    .block.current { background: #152019; border-left-color: #65c38f; color: #f0fff4; }
    .block.future { background: #282615; border-left-color: #e0c05a; color: #fff7d6; }
    .lock-mark { font-size: 13px; color: #9eacbb; }
    .muted { color: #96a1ae; }
    .choice-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .choice { min-height: 58px; text-align: left; }
    .primary-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .primary-actions button { min-height: 42px; }
    .primary-actions .wide { grid-column: 1 / -1; }
    .toolbar { display: flex; gap: 8px; flex-wrap: wrap; }
    .tabs { display: flex; gap: 2px; margin-bottom: 14px; border-bottom: 1px solid #2a333f; }
    .tab { border: none; background: transparent; color: #96a1ae; padding: 8px 18px; cursor: pointer; font-size: 13px; border-bottom: 2px solid transparent; margin-bottom: -1px; }
    .tab:hover { color: #eef2f6; }
    .tab.active { color: #eef2f6; border-bottom-color: #65c38f; }
    .picker-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center; }
    .picker-popup { background: #1a2128; border: 1px solid #384353; border-radius: 8px; padding: 16px; min-width: 260px; max-height: 70vh; overflow-y: auto; }
    .picker-popup > strong { display: block; margin-bottom: 10px; font-size: 14px; }
    .picker-item { display: block; width: 100%; text-align: left; padding: 8px 12px; border: 1px solid #29323e; border-radius: 6px; background: #13191f; margin-bottom: 6px; cursor: pointer; font-size: 13px; }
    .picker-item:hover { background: #202832; border-color: #65c38f; }
    .picker-new { display: grid; grid-template-columns: 1fr auto; gap: 8px; margin-bottom: 12px; }
    .settings-stack { display: grid; gap: 10px; }
    .settings-group { border: 1px solid #29323e; border-radius: 7px; padding: 8px; background: #141a21; }
    .settings-group summary { cursor: pointer; color: #eef2f6; font-weight: 600; font-size: 13px; }
    .settings-group .fields { margin-top: 8px; }
    .course-group { margin-bottom: 16px; }
    .course-group h3 { font-size: 14px; color: #b8c1ce; margin: 0 0 8px; padding-bottom: 4px; border-bottom: 1px solid #29323e; }
    .course-row { display: grid; grid-template-columns: 100px 1fr auto; gap: 8px; padding: 5px 0; border-bottom: 1px solid #1a2128; font-size: 13px; }
    .course-row:last-child { border-bottom: none; }
    .compact main { padding: 10px; }
    .compact h1 { font-size: 15px; }
    .compact .panel { padding: 10px; border-radius: 7px; }
    .compact .section { margin-top: 10px; padding-top: 10px; }
    .compact .fields { grid-template-columns: 1fr 86px; }
    .popup-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .popup-title { font-size: 16px; flex: 1; }
    .popup-due { font-size: 12px; color: #96a1ae; }
    .close-btn { background: none; border: none; color: #96a1ae; font-size: 20px; cursor: pointer; padding: 0 4px; line-height: 1; }
    .close-btn:hover { color: #eef2f6; }
    .popup-gantt { margin-bottom: 10px; }
    .gantt { position: relative; }
    .gantt-ticks { display: flex; justify-content: space-between; font-size: 10px; color: #6a7a90; margin-bottom: 2px; }
    .gantt-track { position: relative; height: 36px; background: #1a2128; border-radius: 4px; overflow: hidden; }
    .gantt-block { position: absolute; top: 2px; bottom: 2px; border-radius: 3px; background: #2a3442; overflow: hidden; padding: 0 4px; display: flex; align-items: center; }
    .gantt-block span { font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #c8d2dc; }
    .gantt-block.course { background: #6b1d1d; }
    .gantt-block.course span { color: #ffc0c0; }
    .gantt-block.current { outline: 2px solid #65c38f; outline-offset: -2px; z-index: 1; }
    .gantt-now { position: absolute; top: 0; bottom: 0; width: 2px; background: #65c38f; z-index: 2; pointer-events: none; }
    .popup-actions { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
    .popup-btn { border: 1px solid #384353; background: #202832; color: #f4f7fb; border-radius: 6px; padding: 8px 6px; cursor: pointer; font-size: 13px; text-align: center; }
    .popup-btn:hover { background: #2a3442; }
    .popup-btn.primary { background: #1a6b3c; border-color: #2a8c52; }
    .popup-btn.primary:hover { background: #20844a; }
    .popup-btn.danger { background: #6b1d1d; border-color: #8c2a2a; }
    .popup-btn.danger:hover { background: #8c2a2a; }
    .popup-submenu { margin-top: 8px; }
    .popup-presets { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
    .preset-btn { border: 1px solid #384353; background: #151b22; color: #f4f7fb; border-radius: 4px; padding: 6px; cursor: pointer; font-size: 12px; text-align: center; }
    .preset-btn:hover { background: #202832; }
    .popup-custom { display: flex; gap: 4px; margin-top: 6px; }
    .popup-custom input { flex: 1; min-width: 0; }
    .popup-custom button { border: 1px solid #384353; background: #202832; color: #f4f7fb; border-radius: 4px; padding: 6px 10px; cursor: pointer; }
  </style>
</head>
<body class="${compact ? 'compact' : ''}">
${body}
<script>
const { ipcRenderer } = require('electron');
function send(action, payload = {}) { ipcRenderer.send(action, payload); }
function byId(id) { return document.getElementById(id); }
${script}
</script>
</body>
</html>`;
}

function renderDayPlanBlocks(blocks = [], now = null) {
  if (blocks.length === 0) return '<div class="muted">No blocks for this day.</div>';
  return blocks.map(block => {
    const classes = ['block', blockTimeState(block, now)];
    if (block.break) classes.push('break');
    const startStr = block.start instanceof Date ? block.start.toISOString() : block.start;
    const endStr = block.end instanceof Date ? block.end.toISOString() : block.end;
    const locked = block.locked === true;
    const action = locked ? 'unlock-block' : 'lock-block';
    return `
    <div class="block-wrap" data-block-actions>
      <div class="block-actions">
        <button class="${locked ? 'locked' : ''}" data-action="${action}" onclick="event.stopPropagation(); lockBlock(this.closest('[data-block-actions]').querySelector('.block'))">${locked ? 'Locked' : 'Lock'}</button>
      </div>
      <div class="${classes.join(' ')}" data-block-start="${esc(startStr)}" data-block-end="${esc(endStr)}" data-block-label="${esc(block.label)}" data-block-item-id="${esc(block.itemId ?? '')}" data-block-event-id="${esc(block.fixedEventId ?? '')}" data-block-source="${esc(block.source ?? '')}" data-block-locked="${locked ? 'true' : 'false'}" onclick="openBlockPicker(event, this)" ontouchstart="startBlockSwipe(event, this)" ontouchend="endBlockSwipe(event, this)" oncontextmenu="event.preventDefault(); toggleBlockActions(this)">
        <strong>${time(block.start)}-${time(block.end)}</strong>
        <span>${esc(block.label)} <small class="muted">${block.durationMinutes ?? durationMinutes(block.start, block.end)}m</small></span>
        <span class="lock-mark">${locked ? 'Locked' : ''}</span>
      </div>
    </div>
  `;
  }).join('');
}

function renderPersonalProjects(items = []) {
  if (items.length === 0) return '<div class="muted">No reminder items.</div>';
  return items.map(item => `
    <div class="item"${item.active !== false ? ` data-project-label="${esc(item.label)}"` : ''}>
      <div>
        <strong>${esc(item.label)}</strong>
        <small>${item.active === false ? 'Archived' : 'Active'} / ${esc(item.defaultDurationMinutes ?? '')}m</small>
      </div>
      ${item.active === false ? '' : `<button data-action="archive-personal-project" onclick="send('archive-personal-project', { itemId: '${esc(item.id)}' })">Archive</button>`}
    </div>
  `).join('');
}

function renderBlockSummary(block, fallback) {
  if (!block) return `<div class="muted">${esc(fallback)}</div>`;
  return `
    <div class="block ${block.break ? 'break' : 'future'}">
      <strong>${time(block.start)}-${time(block.end)}</strong>
      <span>${esc(block.label)} <small class="muted">${block.durationMinutes ?? durationMinutes(block.start, block.end)}m</small></span>
      <small class="muted">${block.break ? 'Rest' : 'Plan'}</small>
    </div>
  `;
}

function renderCurrentActions(current) {
  if (current?.fixedEventId) {
    return `
        <button data-action="adjust-fixed-event-end" onclick="send('adjust-fixed-event-end', { eventId: ${jsValue(current.fixedEventId)}, deltaMinutes: -15 })">End -15m</button>
        <button data-action="adjust-fixed-event-end" onclick="send('adjust-fixed-event-end', { eventId: ${jsValue(current.fixedEventId)}, deltaMinutes: 15 })">End +15m</button>
        <button class="wide" data-action="end-fixed-event" onclick="send('end-fixed-event', { eventId: ${jsValue(current.fixedEventId)} })">End now</button>
        <button class="wide" data-action="cancel-fixed-event" onclick="send('cancel-fixed-event', { eventId: ${jsValue(current.fixedEventId)} })">Cancel block</button>
    `;
  }
  return `
        <button data-action="adjust-current-end" onclick="send('end-current', { move: -15 })">End -15m</button>
        <button data-action="adjust-current-end" onclick="send('extend-current', { extraMinutes: 15 })">End +15m</button>
        <button data-action="add-break" onclick="send('add-break', { minutes: 15 })">休息15m</button>
        <button data-action="add-break" onclick="send('add-break', { minutes: 30 })">休息30m</button>
        <button class="wide" data-action="end-current" onclick="send('end-current', { move: 'now' })">Stop current</button>
  `;
}

function renderCourseTablePage(schedule) {
  if (!schedule || schedule.length === 0) return '<div class="muted">暂无课程表数据。</div>';
  const dayNames = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const grouped = {};
  for (const entry of schedule) {
    const dayName = dayNames[entry.dayOfWeek] ?? `Day${entry.dayOfWeek}`;
    if (!grouped[dayName]) grouped[dayName] = [];
    grouped[dayName].push(entry);
  }
  const order = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  return order.filter(d => grouped[d]).map(dayName => `
    <div class="course-group">
      <h3>${esc(dayName)}</h3>
      ${grouped[dayName].map(entry => `
        <div class="course-row">
          <span class="muted">${entry.startTime}-${entry.endTime}</span>
          <span>${esc(entry.label)}${entry.metadata?.location ? ' <span class="muted">@' + esc(entry.metadata.location) + '</span>' : ''}</span>
          <span class="muted">${esc(entry.metadata?.teacher ?? '')}</span>
        </div>
      `).join('')}
    </div>
  `).join('');
}

function renderProjectPage(view) {
  const items = view.personalProjects ?? [];
  if (items.length === 0) return '<div class="muted">暂无个人项目。</div>';
  return items.map(item => `
    <div class="item"${item.active !== false ? ` data-project-label="${esc(item.label)}"` : ''}>
      <div>
        <strong>${esc(item.label)}</strong>
        <small>${item.active === false ? '已归档' : '进行中'} / ${esc(item.defaultDurationMinutes ?? '')}m</small>
      </div>
      ${item.active === false
        ? `<button onclick="send('add-personal-project', { id: '${esc(item.id)}', label: '${esc(item.label)}', defaultDurationMinutes: ${item.defaultDurationMinutes ?? 30}, active: true })">激活</button>`
        : `<button onclick="send('archive-personal-project', { itemId: '${esc(item.id)}' })">归档</button>`}
    </div>
  `).join('');
}

function renderTransitionOptions(selectedId) {
  return transitionEffectsByGroup().map(group => `
              <optgroup label="${esc(group.label)}">
                ${group.effects.map(effect => `<option value="${esc(effect.id)}"${effect.id === selectedId ? ' selected' : ''}>${esc(effect.label)}</option>`).join('')}
              </optgroup>
  `).join('');
}

export function renderMainHtml(view, options = {}) {
  const dayPlanBlocks = combinedDayPlanBlocks(view);
  const page = options.page ?? 'day-plan';
  const pageContent = page === 'courses' ? `
    <div class="grid" style="grid-template-columns:1fr">
      <section class="panel">
        <h2>课程表</h2>
        ${renderCourseTablePage(view.courseWeeklySchedule)}
        <div class="row section">
          <button onclick="send('clear-course-table')">清空课程表</button>
        </div>
      </section>
    </div>
  ` : page === 'projects' ? `
    <div class="grid" style="grid-template-columns:1fr">
      <section class="panel">
        <h2>个人项目</h2>
        <div class="fields" style="margin-bottom:12px">
          <label>项目名称<input id="projectLabel" placeholder="项目名称"></label>
          <label>时长(分)<input id="projectDuration" type="number" value="${esc(view.settings.defaultReminderDurationMinutes ?? 30)}"></label>
        </div>
        <div class="row section">
          <button onclick="send('add-personal-project', { label: byId('projectLabel').value, defaultDurationMinutes: Number(byId('projectDuration').value) })">添加项目</button>
        </div>
        <div class="list section">${renderProjectPage(view)}</div>
      </section>
    </div>
  ` : `
    <div class="grid">
      <section class="panel">
        <h2>Day Plan</h2>
        <div class="timeline">${renderDayPlanBlocks(dayPlanBlocks, view.now)}</div>
        <div class="row section">
          <button data-action="clear-user-locks" onclick="send('clear-user-locks', { date: '${esc(view.date)}' })">清除Locked状态</button>
        </div>
      </section>
      <aside>
        <section class="panel">
          <h2>Settings</h2>
          <div class="settings-stack">
            <details class="settings-group" open>
              <summary>Schedule</summary>
              <div class="fields">
                <label>Mock now<input id="mockNow" type="datetime-local" value="${esc(isoLocalInput(view.now))}"></label>
                <label>Cooldown minutes<input id="cooldown" type="number" value="${esc(view.settings.defaultEarlyEndCooldownMinutes ?? 180)}"></label>
                <label>Day start<input id="dayStart" value="${esc(view.settings.dayStart ?? '08:00')}"></label>
                <label>Day end<input id="dayEnd" value="${esc(view.settings.dayEnd ?? '23:00')}"></label>
              </div>
            </details>
            <details class="settings-group" open>
              <summary>Transition</summary>
              <div class="fields">
                <label>Effect<select id="transitionEffect">${renderTransitionOptions(view.settings.transitionEffectId)}</select></label>
                <label>Triangle size<input id="transitionTriangleSize" type="number" min="24" max="180" value="${esc(view.settings.transitionTriangleSizePx ?? DEFAULT_TRANSITION_SETTINGS.transitionTriangleSizePx)}"></label>
                <label>Tilt angle<input id="transitionTilt" type="number" min="-45" max="45" value="${esc(view.settings.transitionTiltDeg ?? DEFAULT_TRANSITION_SETTINGS.transitionTiltDeg)}"></label>
              </div>
            </details>
          </div>
          <div class="row section">
            <button data-action="update-settings" onclick="send('update-settings', { mockNow: localToIso(byId('mockNow').value), defaultEarlyEndCooldownMinutes: Number(byId('cooldown').value), dayStart: byId('dayStart').value, dayEnd: byId('dayEnd').value, transitionEffectId: byId('transitionEffect').value, transitionTriangleSizePx: Number(byId('transitionTriangleSize').value), transitionTiltDeg: Number(byId('transitionTilt').value) })">Save settings</button>
          </div>
        </section>
        <section class="panel section">
          <h2>Add Reminder</h2>
          <div class="fields">
            <label>Name<input id="reminderLabel" placeholder="Task name"></label>
            <label>Minutes<input id="reminderDuration" type="number" value="${esc(view.settings.defaultReminderDurationMinutes ?? 30)}"></label>
          </div>
          <div class="row section">
            <button data-action="add-personal-project" onclick="send('add-personal-project', { label: byId('reminderLabel').value, defaultDurationMinutes: Number(byId('reminderDuration').value) })">Add</button>
          </div>
          <div class="list section">${renderPersonalProjects(view.personalProjects)}</div>
        </section>
        <section class="panel section">
          <h2>Course Table Import</h2>
          <label>AI prompt<textarea id="courseTablePrompt" readonly>${esc(COURSE_TABLE_AI_PROMPT)}</textarea></label>
          <div class="row section">
            <button onclick="copyText('courseTablePrompt')">Copy prompt</button>
            <span class="muted">Schema: ${esc(COURSE_TABLE_WEEKLY_SCHEMA_ID)}</span>
          </div>
          <label class="section">Generated JSON<textarea id="courseTableJson" placeholder="{ &quot;schema&quot;: &quot;${esc(COURSE_TABLE_WEEKLY_SCHEMA_ID)}&quot;, &quot;timezone&quot;: &quot;+08:00&quot;, &quot;events&quot;: [] }"></textarea></label>
          <div class="row section">
            <button data-action="import-course-table" onclick="send('import-course-table', { json: byId('courseTableJson').value })">Import JSON</button>
            <button data-action="clear-course-table" onclick="send('clear-course-table')">清空课程表</button>
          </div>
        </section>
        <section class="panel section">
          <h2>Add Time Block</h2>
          <div class="fields">
            <label>Name<input id="fixedLabel" placeholder="Class / meeting"></label>
            <label>Date<input id="fixedDate" value="${esc(view.date)}"></label>
            <label>Start<input id="fixedStart" value="${esc(time(view.now))}"></label>
            <label>Minutes<input id="fixedDuration" type="number" value="60"></label>
          </div>
          <div class="row section">
            <button data-action="add-fixed-event" onclick="send('add-fixed-event', { label: byId('fixedLabel').value, date: byId('fixedDate').value, startTime: byId('fixedStart').value, durationMinutes: Number(byId('fixedDuration').value), source: 'fixed' })">Add time</button>
          </div>
        </section>
      </aside>
    </div>
  `;

  const body = `<main>
    <div class="top">
      <div>
        <h1>Tabula Rasa</h1>
        <div class="meta">${esc(view.date)} / ${time(view.now)} / ${esc(view.timeMode)} / ${view.paused ? 'paused' : 'running'}</div>
      </div>
      <div class="toolbar">
        <button data-action="set-time-mode" onclick="send('set-time-mode', { timeMode: 'real' })">Real</button>
        <button data-action="set-time-mode" onclick="send('set-time-mode', { timeMode: 'mock', mockNow: byId('mockNow').value })">Mock</button>
        <button onclick="send('open-tray-widget')">Quick</button>
      </div>
    </div>
    <nav class="tabs">
      <button class="tab${page === 'day-plan' ? ' active' : ''}" onclick="send('switch-page', { page: 'day-plan' })">Day Plan</button>
      <button class="tab${page === 'courses' ? ' active' : ''}" onclick="send('switch-page', { page: 'courses' })">课程表</button>
      <button class="tab${page === 'projects' ? ' active' : ''}" onclick="send('switch-page', { page: 'projects' })">个人项目</button>
    </nav>
    <div class="message">${esc(options.message ?? '')}</div>
    ${pageContent}
    <div id="projectPicker" class="picker-overlay" style="display:none" onclick="if(event.target===this)closeProjectPicker()">
      <div class="picker-popup">
        <strong>选择项目</strong>
        <div class="picker-new">
          <input id="newBlockProjectLabel" placeholder="新事项">
          <button data-action="change-block-project" onclick="createOneOffProject()">新建</button>
        </div>
        <div id="pickerList"></div>
        <button style="margin-top:8px;width:100%" onclick="closeProjectPicker()">取消</button>
      </div>
    </div>
  </main>`;
  return shell({
    title: 'Tabula Rasa',
    body,
    script: `
var _pickerStart = null;
var _pickerEnd = null;
var _pickerLabel = null;
var _pickerItemId = null;
var _swipeStartX = null;
var _suppressNextBlockClick = false;
function localToIso(value) {
  if (!value) return null;
  return new Date(value).toISOString();
}
function copyText(id) {
  const element = byId(id);
  if (!element) return;
  element.select();
  document.execCommand('copy');
}
function openBlockPicker(event, blockEl) {
  if (_suppressNextBlockClick) {
    _suppressNextBlockClick = false;
    event.preventDefault();
    return;
  }
  openProjectPicker(blockEl);
}
function openProjectPicker(blockEl) {
  _pickerStart = blockEl.getAttribute('data-block-start');
  _pickerEnd = blockEl.getAttribute('data-block-end');
  _pickerLabel = blockEl.getAttribute('data-block-label');
  _pickerItemId = blockEl.getAttribute('data-block-item-id');
  var list = document.getElementById('pickerList');
  var items = document.querySelectorAll('[data-project-label]');
  var input = document.getElementById('newBlockProjectLabel');
  if (input) input.value = '';
  list.innerHTML = '';
  items.forEach(function(el) {
    var label = el.getAttribute('data-project-label');
    var btn = document.createElement('button');
    btn.className = 'picker-item';
    btn.textContent = label;
    btn.onclick = function() {
      if (_pickerStart && _pickerEnd) send('change-block-project', { start: _pickerStart, end: _pickerEnd, newLabel: label, oneOff: false });
      closeProjectPicker();
    };
    list.appendChild(btn);
  });
  if (list.children.length === 0) list.innerHTML = '<div class="muted">暂无可用项目</div>';
  document.getElementById('projectPicker').style.display = 'flex';
}
function createOneOffProject() {
  var input = document.getElementById('newBlockProjectLabel');
  var label = input ? input.value.trim() : '';
  if (!label || !_pickerStart || !_pickerEnd) return;
  send('change-block-project', { start: _pickerStart, end: _pickerEnd, newLabel: label, oneOff: true });
  closeProjectPicker();
}
function toggleBlockActions(blockEl) {
  var wrap = blockEl.closest('[data-block-actions]');
  if (!wrap) return;
  wrap.classList.toggle('actions-visible');
}
function startBlockSwipe(event, blockEl) {
  _swipeStartX = event.changedTouches && event.changedTouches[0] ? event.changedTouches[0].clientX : null;
}
function endBlockSwipe(event, blockEl) {
  if (_swipeStartX == null || !event.changedTouches || !event.changedTouches[0]) return;
  var dx = event.changedTouches[0].clientX - _swipeStartX;
  _swipeStartX = null;
  if (dx > 35) {
    _suppressNextBlockClick = true;
    event.preventDefault();
    toggleBlockActions(blockEl);
  }
}
function lockBlock(blockEl) {
  if (!blockEl) return;
  var locked = blockEl.getAttribute('data-block-locked') === 'true';
  var payload = {
    start: blockEl.getAttribute('data-block-start'),
    end: blockEl.getAttribute('data-block-end'),
    label: blockEl.getAttribute('data-block-label'),
    itemId: blockEl.getAttribute('data-block-item-id') || null,
    eventId: blockEl.getAttribute('data-block-event-id') || null,
  };
  send(locked ? 'unlock-block' : 'lock-block', payload);
}
function closeProjectPicker() {
  document.getElementById('projectPicker').style.display = 'none';
  _pickerStart = null;
  _pickerEnd = null;
  _pickerLabel = null;
  _pickerItemId = null;
}
`,
  });
}

export function renderTrayWidgetHtml(view, options = {}) {
  const pair = view.preferencePair;
  const pairHtml = pair ? `
    <div class="choice-grid">
      <button class="choice" data-action="resolve-preference" onclick="send('resolve-preference', { leftItemId: '${esc(pair.left.id)}', rightItemId: '${esc(pair.right.id)}', choice: 'left' })"><strong>${esc(pair.left.label)}</strong></button>
      <button class="choice" data-action="resolve-preference" onclick="send('resolve-preference', { leftItemId: '${esc(pair.left.id)}', rightItemId: '${esc(pair.right.id)}', choice: 'right' })"><strong>${esc(pair.right.label)}</strong></button>
    </div>
    <div class="row" style="margin-top:8px">
      <button data-action="resolve-preference" onclick="send('resolve-preference', { leftItemId: '${esc(pair.left.id)}', rightItemId: '${esc(pair.right.id)}', choice: 'tie' })">Tie</button>
      <button data-action="resolve-preference" onclick="send('resolve-preference', { leftItemId: '${esc(pair.left.id)}', rightItemId: '${esc(pair.right.id)}', choice: 'skip' })">Skip</button>
    </div>
  ` : '<div class="muted">Need at least two active items.</div>';
  const dayPlanBlocks = combinedDayPlanBlocks(view);
  const current = currentDayPlanBlock(dayPlanBlocks, view.now);
  const next = nextDayPlanBlock(dayPlanBlocks, view.now);

  const body = `<main>
    <div class="top">
      <div>
        <h1>${view.paused ? 'Paused' : 'Quick Panel'}</h1>
        <div class="meta">${esc(view.date)} ${time(view.now)} / ${esc(view.timeMode)}</div>
      </div>
      <button data-action="toggle-pause" onclick="send('toggle-pause')">${view.paused ? 'Resume' : 'Pause'}</button>
    </div>
    <div class="message">${esc(options.message ?? '')}</div>
    <section class="panel">
      <h2>Now</h2>
      <div class="hero-status">
        <div>
          <small class="muted">Current</small>
          <strong>${current ? esc(current.label) : 'No active block'}</strong>
        </div>
        <div class="meta">${current ? `${time(current.start)}-${time(current.end)}` : 'Nothing scheduled right now'}</div>
      </div>
      <div class="primary-actions">
${renderCurrentActions(current)}
      </div>
    </section>
    <section class="panel section">
      <h2>Next</h2>
      <div class="timeline">${renderBlockSummary(next, 'No upcoming block.')}</div>
    </section>
    <section class="panel section">
      <h2>Temporary Event</h2>
      <div class="row">
        <button data-action="quick-temp" onclick="send('add-temporary-event', { date: '${esc(view.date)}', label: 'Meeting', startTime: '${time(view.now)}', durationMinutes: 30 })">Now 30m</button>
        <button data-action="quick-temp" onclick="send('add-temporary-event', { date: '${esc(view.date)}', label: 'Meeting', startTime: '${time(view.now)}', durationMinutes: 60 })">Now 60m</button>
      </div>
    </section>
    <section class="panel section">
      <h2>First impression</h2>
      ${pairHtml}
    </section>
  </main>`;
  return shell({ title: 'Tabula Rasa Quick', body, compact: true });
}

function ganttBarStyle(blockStart, blockEnd, windowStart, windowEnd) {
  const totalWidth = windowEnd - windowStart;
  if (totalWidth <= 0) return '';
  const left = Math.max(0, (blockStart - windowStart) / totalWidth * 100);
  const width = Math.min(100 - left, (blockEnd - blockStart) / totalWidth * 100);
  if (width <= 0) return '';
  return `left:${left.toFixed(1)}%;width:${width.toFixed(1)}%`;
}

function renderCompactGantt(dayPlanBlocks, now, windowStart, windowEnd) {
  const visible = dayPlanBlocks.filter(b => {
    const s = new Date(b.start).getTime();
    const e = new Date(b.end).getTime();
    return s < windowEnd && e > windowStart;
  });
  const currentBlock = dayPlanBlocks.find(b => {
    const s = new Date(b.start).getTime();
    const e = new Date(b.end).getTime();
    return s <= now && e > now;
  });

  return `<div class="gantt">
    <div class="gantt-ticks">
      ${[windowStart, windowStart + (windowEnd - windowStart) / 2, windowEnd].map(t => `<span>${time(new Date(t))}</span>`).join('')}
    </div>
    <div class="gantt-track">
      ${visible.map(b => {
        const s = new Date(b.start).getTime();
        const e = new Date(b.end).getTime();
        const isCourse = b.source === 'course-import' || b.courseBlock === true || b.lockedEventSource === 'course-import';
        const isCurrent = currentBlock && s >= currentBlock.start.getTime() && e <= currentBlock.end.getTime() && b.label === currentBlock.label;
        return `<div class="gantt-block${isCourse ? ' course' : ''}${isCurrent ? ' current' : ''}" style="${ganttBarStyle(s, e, windowStart, windowEnd)}"><span>${esc(b.label)}</span></div>`;
      }).join('')}
      <div class="gantt-now" style="left:${((now - windowStart) / (windowEnd - windowStart) * 100).toFixed(1)}%"></div>
    </div>
  </div>`;
}

export function renderReminderPopupHtml(reminder, view) {
  const now = new Date(view.now).getTime();
  const dayPlanBlocks = combinedDayPlanBlocks(view);
  const windowMs = 4 * 3600000;
  const windowStart = now - windowMs / 2;
  const windowEnd = now + windowMs / 2;

  const body = `<main>
    <div class="popup-header">
      <strong class="popup-title">${esc(reminder.title)}</strong>
      <span class="popup-due">${esc(reminder.dueAt?.slice(11, 16) ?? '')}</span>
      <button class="close-btn" onclick="send('reminder:close', { id: '${esc(reminder.id)}' })">×</button>
    </div>
    <div class="popup-gantt">
      ${renderCompactGantt(dayPlanBlocks, now, windowStart, windowEnd)}
    </div>
    <div class="popup-actions">
      <button class="popup-btn" onclick="showSnoozeMenu()">Snooze</button>
      <button class="popup-btn primary" onclick="showStartMenu()">开始</button>
      <button class="popup-btn danger" onclick="send('reminder:delete', { id: '${esc(reminder.id)}' })">删除</button>
    </div>
    <div id="snoozeMenu" class="popup-submenu" style="display:none">
      <div class="popup-presets">
        ${[5, 10, 15, 30, 60].map(m => `<button class="preset-btn" onclick="send('reminder:snooze', { id: '${esc(reminder.id)}', presetMinutes: ${m} })">${m}分钟</button>`).join('')}
        <button class="preset-btn" onclick="showCustomSnooze()">自定义</button>
      </div>
      <div id="customSnooze" style="display:none" class="popup-custom">
        <input id="snoozeDate" type="date" value="${esc(view.date)}">
        <input id="snoozeTime" type="time" value="${esc(time(new Date(now + 15 * 60000)))}">
        <button onclick="sendCustomSnooze('${esc(reminder.id)}')">确认</button>
      </div>
    </div>
    <div id="startMenu" class="popup-submenu" style="display:none">
      <div class="popup-presets">
        ${[15, 30, 45, 60, 90].map(m => `<button class="preset-btn" onclick="send('reminder:start', { id: '${esc(reminder.id)}', durationMinutes: ${m} })">${m}分钟</button>`).join('')}
        <button class="preset-btn" onclick="showCustomStart()">自定义</button>
      </div>
      <div id="customStart" style="display:none" class="popup-custom">
        <input id="startMinutes" type="number" value="30" min="5" max="480">
        <button onclick="sendCustomStart('${esc(reminder.id)}')">确认</button>
      </div>
    </div>
  </main>`;

  return shell({ title: 'Reminder', body, compact: true, script: `
    function showSnoozeMenu() {
      document.getElementById('snoozeMenu').style.display = 'block';
      document.getElementById('startMenu').style.display = 'none';
    }
    function showStartMenu() {
      document.getElementById('startMenu').style.display = 'block';
      document.getElementById('snoozeMenu').style.display = 'none';
    }
    function showCustomSnooze() {
      document.getElementById('customSnooze').style.display = 'flex';
    }
    function showCustomStart() {
      document.getElementById('customStart').style.display = 'flex';
    }
    function sendCustomSnooze(id) {
      var date = byId('snoozeDate').value;
      var time = byId('snoozeTime').value;
      if (date && time) send('reminder:snooze', { id: id, presetMinutes: null, customDueAt: date + 'T' + time });
    }
    function sendCustomStart(id) {
      var minutes = Number(byId('startMinutes').value);
      if (minutes > 0) send('reminder:start', { id: id, durationMinutes: minutes });
    }
  ` });
}
