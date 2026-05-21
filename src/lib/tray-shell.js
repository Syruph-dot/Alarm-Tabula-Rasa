export function createTrayShellState(overrides = {}) {
  return {
    paused: false,
    windowVisible: true,
    shouldQuit: false,
    ...overrides,
  };
}

export function updateTrayShellState(state, action) {
  if (action === 'pause') return { ...state, paused: true };
  if (action === 'resume') return { ...state, paused: false };
  if (action === 'show-window') return { ...state, windowVisible: true };
  if (action === 'window-close') return state.shouldQuit
    ? state
    : { ...state, windowVisible: false };
  if (action === 'quit') return { ...state, shouldQuit: true };
  return state;
}

export function shouldFireAlarm(state) {
  return !state.paused;
}

export function getTrayMenuTemplate(state) {
  return [
    { id: 'open-main', label: '打开主窗口' },
    { id: 'preference', label: '偏好采样' },
    { id: 'temporary-event', label: '加入临时事件' },
    { type: 'separator' },
    state.paused
      ? { id: 'resume', label: '恢复提醒' }
      : { id: 'pause', label: '暂停提醒' },
    { type: 'separator' },
    { id: 'quit', label: '退出' },
  ];
}
