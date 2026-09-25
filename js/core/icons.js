/* Line icons drawn on a 24×24 grid (stroke-based, like SF Symbols).
   Usage: icon('dumbbell') or icon('dumbbell', 'extra-class'). */
import { raw } from './html.js';

const PATHS = {
  // Navigation
  dumbbell: '<rect x="4.6" y="6" width="3.1" height="12" rx="1.3"/><rect x="16.3" y="6" width="3.1" height="12" rx="1.3"/><path d="M2.3 9.6v4.8M21.7 9.6v4.8M7.7 12h8.6"/>',
  checklist: '<path d="M3.6 7.1l2 2 3.5-3.6M3.6 16.1l2 2 3.5-3.6M12.5 7.8h8M12.5 16.8h8"/>',
  dashboard: '<rect x="3.5" y="3.5" width="7" height="9" rx="2"/><rect x="13.5" y="3.5" width="7" height="5" rx="2"/><rect x="13.5" y="11.5" width="7" height="9" rx="2"/><rect x="3.5" y="15.5" width="7" height="5" rx="2"/>',
  brain: '<path d="M12 5.4C12 4.1 11 3.2 9.8 3.2 8.6 3.2 7.7 4 7.5 5 6 5 4.8 6.2 4.8 7.7c0 .4.1.8.2 1.1C3.8 9.4 3 10.6 3 12s.8 2.6 2 3.2c-.1.3-.2.7-.2 1.1C4.8 17.8 6 19 7.5 19c.2 1 1.1 1.8 2.3 1.8 1.2 0 2.2-.9 2.2-2.1"/><path d="M12 5.4c0-1.3 1-2.2 2.2-2.2 1.2 0 2.1.8 2.3 1.8 1.5 0 2.7 1.2 2.7 2.7 0 .4-.1.8-.2 1.1 1.2.6 2 1.8 2 3.2s-.8 2.6-2 3.2c.1.3.2.7.2 1.1 0 1.5-1.2 2.7-2.7 2.7-.2 1-1.1 1.8-2.3 1.8-1.2 0-2.2-.9-2.2-2.1"/><path d="M12 5.4v13.3M8.3 8.6c1.2 0 2.1.8 2.1 2M6.9 13.3c1.4-.3 2.8.4 3.2 1.8M15.7 8.6c-1.2 0-2.1.8-2.1 2M17.1 13.3c-1.4-.3-2.8.4-3.2 1.8"/>',
  gear: '<path d="M10.31 5.21L10.45 2.73h3.1l.14 2.48A7 7 0 0 1 15.61 6l1.85-1.65 2.19 2.19L18 8.39a7 7 0 0 1 .79 1.92l2.48.14v3.1l-2.48.14A7 7 0 0 1 18 15.61l1.65 1.85-2.19 2.19L15.61 18a7 7 0 0 1-1.92.79l-.14 2.48h-3.1l-.14-2.48A7 7 0 0 1 8.39 18l-1.85 1.65-2.19-2.19L6 15.61a7 7 0 0 1-.79-1.92l-2.48-.14v-3.1l2.48-.14A7 7 0 0 1 6 8.39L4.35 6.54l2.19-2.19L8.39 6a7 7 0 0 1 1.92-.79z"/><circle cx="12" cy="12" r="3"/>',

  // General
  chevronDown: '<path d="M6 9.5l6 6 6-6"/>',
  chevronRight: '<path d="M9.5 6l6 6-6 6"/>',
  chevronUpDown: '<path d="M8 9.5l4-4 4 4M8 14.5l4 4 4-4"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  grip: '<path d="M5 8.5h14M5 12h14M5 15.5h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  checkCircle: '<circle cx="12" cy="12" r="8.5"/><path d="M8.2 12.3l2.6 2.6 5-5.2"/>',
  circle: '<circle cx="12" cy="12" r="8.5"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>',
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.6M12 16.8v.2"/>',
  sparkles: '<path d="M11 3.5l1.7 4.3L17 9.5l-4.3 1.7L11 15.5l-1.7-4.3L5 9.5l4.3-1.7z"/><path d="M18 14.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z"/>',
  bolt: '<path d="M13 3L5.5 13.5h6L10.5 21 18.5 10.5h-6z"/>',
  flag: '<path d="M5.5 21V4.5M5.5 4.5h11.5l-2.2 4.2 2.2 4.3H5.5"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  hourglass: '<path d="M7 3.5h10M7 20.5h10M8 3.5c0 4 4 5.5 4 8.5s-4 4.5-4 8.5M16 3.5c0 4-4 5.5-4 8.5s4 4.5 4 8.5"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/>',
  swap: '<path d="M4 8.5h14M14.5 5L18 8.5 14.5 12M20 15.5H6M9.5 12L6 15.5 9.5 19"/>',
  pulse: '<path d="M3 12.5h3.8l2.4-5.5 4.6 10.5 2.6-6 1.4 1H21"/>',

  // Time & places
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  calendarCheck: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4M9 15l2 2 4-4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.8M9.5 2.8h5M18.4 6.6l1.3-1.3"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  sort: '<path d="M7 4.5v15M3.5 16L7 19.5 10.5 16M17 19.5v-15M13.5 8L17 4.5 20.5 8"/>',

  // Health & workout
  flame: '<path d="M12 21c-3.8 0-6.5-2.6-6.5-6.2 0-2.6 1.5-4.4 3-5.9.3 1.4 1 2.3 2 2.8-.3-3 1-5.6 3.6-7.7.3 2.4 1.5 4 2.8 5.5 1.2 1.4 1.8 2.9 1.8 5 0 3.8-2.8 6.5-6.7 6.5z"/>',
  scale: '<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="M7.8 10a5.8 5.8 0 0 1 8.4 0"/><path d="M12 11.5l1.5-2.4"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>',
  trophy: '<path d="M8 4h8v5.5a4 4 0 0 1-8 0zM8 6H4.5v1.5A3 3 0 0 0 8 10.4M16 6h3.5v1.5a3 3 0 0 1-3.5 2.9M12 13.5V17M8.5 20.5h7M9.5 17h5v3.5h-5z"/>',

  // Appearance
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.8v1.9M12 19.3v1.9M4.9 4.9l1.3 1.3M17.8 17.8l1.3 1.3M2.8 12h1.9M19.3 12h1.9M4.9 19.1l1.3-1.3M17.8 6.2l1.3-1.3"/>',
  moon: '<path d="M19.5 14.6A7.8 7.8 0 1 1 9.4 4.5a6.3 6.3 0 0 0 10.1 10.1z"/>',
  monitor: '<rect x="3" y="4" width="18" height="12.5" rx="2.5"/><path d="M8.5 20h7M12 16.5V20"/>',
  camera: '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.7l1.5-2h4.6l1.5 2h1.7A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.3"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5L5 20"/>',

  // Data
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/>',
  share: '<path d="M12 3.5v11M8 7.5l4-4 4 4"/><path d="M8 10.5H6.5A1.5 1.5 0 0 0 5 12v7a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-7a1.5 1.5 0 0 0-1.5-1.5H16"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.9 12.2A1.5 1.5 0 0 0 8.9 20.5h6.2a1.5 1.5 0 0 0 1.5-1.3L17.5 7"/>',
  database: '<ellipse cx="12" cy="6" rx="7" ry="2.8"/><path d="M5 6v12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8"/>',
  sheet: '<rect x="4.5" y="3.5" width="15" height="17" rx="2"/><path d="M4.5 9h15M4.5 14.5h15M10 9v11.5"/>',
  cloud: '<path d="M7 18.5h10.5a3.8 3.8 0 0 0 .4-7.6 5.5 5.5 0 0 0-10.6-1.5A4.6 4.6 0 0 0 7 18.5z"/>',
  sampleData: '<path d="M9 3.5h6M10 3.5v5.2L5.2 17a2.4 2.4 0 0 0 2.1 3.5h9.4a2.4 2.4 0 0 0 2.1-3.5L14 8.7V3.5"/><path d="M7.5 14h9"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z"/><path d="M8.8 12.2l2.2 2.2 4.2-4.3"/>',
  smartphone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.6 16a5 5 0 0 1 6.8 0"/><circle cx="12" cy="19.2" r=".6"/>',
  external: '<path d="M14 4.5h5.5V10M19.5 4.5l-8.5 8.5M17.5 14v4a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4"/>',
  refresh: '<path d="M20 11.5A8 8 0 0 0 5.6 7M4 4.5V8h3.5M4 12.5A8 8 0 0 0 18.4 17M20 19.5V16h-3.5"/>',

  // Neurology tools
  layers: '<path d="M12 3.5l8.5 4.5L12 12.5 3.5 8z"/><path d="M3.5 12.5L12 17l8.5-4.5M3.5 16.5L12 21l8.5-4.5"/>',
  cards: '<rect x="3.5" y="7" width="12" height="13.5" rx="2"/><path d="M8.5 4h10a2 2 0 0 1 2 2v11.5"/>',
  note: '<path d="M6.5 3.5h7.5l4.5 4.5v11a1.5 1.5 0 0 1-1.5 1.5h-10.5A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5z"/><path d="M13.5 3.5V8.5h5M8.5 13h7M8.5 16.5h4.5"/>',
  book: '<path d="M5 5.5a2 2 0 0 1 2-2h12.5v14H7a2 2 0 0 0-2 2z"/><path d="M5 19.5a2 2 0 0 0 2 2h12.5v-4"/>',
  clipboard: '<rect x="5" y="4.5" width="14" height="16.5" rx="2"/><rect x="9" y="3" width="6" height="3.2" rx="1"/><path d="M8.5 11h7M8.5 14.5h7M8.5 18h4"/>',
  briefcase: '<rect x="3.5" y="7" width="17" height="12.5" rx="2.5"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12.5h17"/>',
  chart: '<path d="M4 20.5h16"/><rect x="5.5" y="11" width="3" height="6.5" rx="1"/><rect x="10.5" y="6" width="3" height="11.5" rx="1"/><rect x="15.5" y="9" width="3" height="8.5" rx="1"/>',
};

export function icon(name, className = '') {
  const body = PATHS[name] ?? PATHS.circle;
  return raw(
    `<svg class="icon${className ? ` ${className}` : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`,
  );
}

export const ICON_NAMES = Object.keys(PATHS);
