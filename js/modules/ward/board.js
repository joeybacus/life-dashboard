/* The patient dashboard's layout: where each of a list's columns sits when a
   patient is opened full screen, and how its text looks. Saved on the list
   (def.board, synced in the Ward lists tab with its name and columns — never
   patient data), so every device shows the same dashboard.

   def.board = {
     cols: 1 | 2 | 3,        // columns on a wide screen (iPhone always stacks them)
     wide: 0 | 1 | 2 | 3,    // the column made wider, 0 for even widths
     tiles: { <letter>: { zone, order, size, flow, hidden } },
   }
   zone 0 = across the top, 1–3 = the columns. size −2…+2 = smaller…larger
   text. flow 2 = the tile's text in two columns (for long labs). Columns with
   no tile yet (new ones) take turns between the columns. */

export const MAX_COLS = 3;
export const MIN_SIZE = -2;
export const MAX_SIZE = 2;

const clampInt = (n, lo, hi, fallback) => (Number.isInteger(n) ? Math.min(hi, Math.max(lo, n)) : fallback);

/**
 * The layout for a list's columns: { cols, wide, zones: [[tile…] × cols+1] },
 * each tile { col, zone, order, size, flow, hidden } in its zone's order.
 */
export function boardOf(saved, columns) {
  const cols = clampInt(saved?.cols, 1, MAX_COLS, 2);
  const wide = clampInt(saved?.wide, 0, cols, 0);
  const zones = Array.from({ length: cols + 1 }, () => []);
  let fresh = 0;
  columns.forEach((c, i) => {
    const t = saved?.tiles?.[c.col];
    const tile = t
      ? {
        col: c.col,
        zone: clampInt(t.zone, 0, cols, cols), // a tile in a column that's gone moves to the last one
        order: Number.isFinite(t.order) ? t.order : 1000 + i,
        size: clampInt(t.size, MIN_SIZE, MAX_SIZE, 0),
        flow: t.flow === 2 ? 2 : 1,
        hidden: Boolean(t.hidden),
      }
      : { col: c.col, zone: (fresh++ % cols) + 1, order: 1000 + i, size: 0, flow: 1, hidden: false };
    zones[tile.zone].push(tile);
  });
  zones.forEach((z) => z.sort((a, b) => a.order - b.order));
  return { cols, wide, zones };
}

/** What to save: each tile's place as its position in its zone. */
export function savedBoard(board) {
  const tiles = {};
  board.zones.forEach((zone, z) => zone.forEach((t, order) => {
    tiles[t.col] = { zone: z, order, size: t.size, flow: t.flow, hidden: t.hidden };
  }));
  return { cols: board.cols, wide: board.wide, tiles };
}

const find = (board, col) => {
  for (const [z, zone] of board.zones.entries()) {
    const i = zone.findIndex((t) => t.col === col);
    if (i >= 0) return { z, i, tile: zone[i] };
  }
  return null;
};

/**
 * One change to the layout, returning the new one (the old one is untouched).
 * op: 'up' | 'down' | 'left' | 'right' | 'top' | 'bigger' | 'smaller' | 'flow' | 'hide' | 'show'
 */
export function changeTile(board, col, op) {
  const next = { ...board, zones: board.zones.map((z) => z.map((t) => ({ ...t }))) };
  const at = find(next, col);
  if (!at) return next;
  const { z, i, tile } = at;
  const zone = next.zones[z];
  const moveTo = (target) => {
    zone.splice(i, 1);
    next.zones[target].push(tile);
  };
  if (op === 'up' && i > 0) [zone[i - 1], zone[i]] = [zone[i], zone[i - 1]];
  else if (op === 'down' && i < zone.length - 1) [zone[i + 1], zone[i]] = [zone[i], zone[i + 1]];
  else if (op === 'left' && z > 1) moveTo(z - 1);
  else if (op === 'right' && z >= 1 && z < next.cols) moveTo(z + 1);
  else if (op === 'top') moveTo(z === 0 ? 1 : 0); // to the top, or back into the first column
  else if (op === 'bigger') tile.size = Math.min(MAX_SIZE, tile.size + 1);
  else if (op === 'smaller') tile.size = Math.max(MIN_SIZE, tile.size - 1);
  else if (op === 'flow') tile.flow = tile.flow === 2 ? 1 : 2;
  else if (op === 'hide') tile.hidden = true;
  else if (op === 'show') tile.hidden = false;
  return next;
}

/** A different number of columns: tiles in columns that go move into the last one left. */
export function withCols(board, cols) {
  const n = clampInt(cols, 1, MAX_COLS, board.cols);
  const zones = Array.from({ length: n + 1 }, (_, z) => (board.zones[z] ?? []).map((t) => ({ ...t })));
  board.zones.slice(n + 1).forEach((zone) => zones[n].push(...zone.map((t) => ({ ...t }))));
  return { cols: n, wide: board.wide > n ? 0 : board.wide, zones };
}
