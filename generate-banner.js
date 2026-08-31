// Generates banner.svg: a fixed-grid LED sign (squares never move) that
// steps content past one column at a time, stops with LMNTRTL's L at the
// left edge, holds still, then cuts (blips) straight back to the start —
// like a looping GIF, not a smooth scroll.
const fs = require('fs');
const path = require('path');

const FONT = {
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  N: ['10001', '11001', '10101', '10101', '10011', '10001', '10001'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00000', '00100'],
  ',': ['00000', '00000', '00000', '00000', '00000', '00100', '01000'],
};

// ---- 1. Build the content strip as a list of 7-bit columns ----
const cols = []; // cols[i] = [row0..row6] bits (0/1)
function addGlyph(ch) {
  const g = FONT[ch];
  for (let c = 0; c < 5; c++) {
    const col = [];
    for (let r = 0; r < 7; r++) col.push(g[r][c] === '1' ? 1 : 0);
    cols.push(col);
  }
}
function addGap(n) {
  for (let i = 0; i < n; i++) cols.push([0, 0, 0, 0, 0, 0, 0]);
}

const WORD_GAP = 5; // same gap after every word, including the last
function addWord(word) {
  word.split('').forEach((ch, i, arr) => {
    addGlyph(ch);
    addGap(i === arr.length - 1 ? WORD_GAP : 1);
  });
}

addWord('HI,');
addWord('I');
addWord('AM');

const LMN_L_START_COL = cols.length;
addWord('LMNTRTL.');

const CONTENT_LEN = cols.length;

// ---- 2. Layout constants ----
const CELL = 10, GAP = 2, PITCH = CELL + GAP, ROWS = 7;
const DISPLAY_COLS = 56;
const MARGIN = 8;
const GRID_W = DISPLAY_COLS * PITCH - GAP;
const GRID_H = ROWS * PITCH - GAP;
const VIEW_WIDTH = GRID_W + MARGIN * 2;
const VIEW_HEIGHT = GRID_H + MARGIN * 2;
const GRID_X = MARGIN, GRID_Y = MARGIN;

const BG = '#0d1117';
const OFF_CELL = '#21262d';
// GitHub's real contribution-graph tiers (level1..level4) — each lit LED is
// permanently assigned one of these, like an old bulb vs. a fresh one, so
// the word blends into the grid instead of reading as a flat block of color.
const GH_GREENS = ['#0e4429', '#006d32', '#26a641', '#39d353'];

function pickShade() {
  return GH_GREENS[Math.floor(Math.random() * GH_GREENS.length)];
}

// ---- 3. Build the discrete frame timeline ----
const SCROLL_STEP_DUR = 0.1; // seconds per column shift
const START_HOLD = 1; // seconds to sit on "HI," before scrolling starts
const HOLD_DURATION = 3.5; // seconds to sit still once LMNTRTL lands
const numSteps = LMN_L_START_COL; // shift until that column hits display col 0
const M = numSteps + 1; // offsets 0..numSteps inclusive; first/last sit longer

const durs = new Array(M).fill(SCROLL_STEP_DUR);
durs[0] += START_HOLD;
durs[M - 1] += HOLD_DURATION;

const start = new Array(M);
let acc = 0;
for (let f = 0; f < M; f++) { start[f] = acc; acc += durs[f]; }
const TOTAL_DUR = acc;
const kt = start.map((s) => s / TOTAL_DUR);

function bitAt(contentIdx, row) {
  if (contentIdx < 0 || contentIdx >= CONTENT_LEN) return 0;
  return cols[contentIdx][row];
}

function frameColor(col, row, f, shade) {
  // whole column lights in sync (no per-pixel timing lag) so glyph shapes
  // stay readable while scrolling; only the shade varies per LED.
  return bitAt(col + f, row) ? shade : OFF_CELL;
}

// ---- 4. Emit one rect per physical LED, animating fill only when it changes ----
const rects = [];
for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < DISPLAY_COLS; col++) {
    const x = GRID_X + col * PITCH;
    const y = GRID_Y + row * PITCH;
    const shade = pickShade();

    const runs = []; // {frame, color}
    let prev = null;
    for (let f = 0; f < M; f++) {
      const c = frameColor(col, row, f, shade);
      if (c !== prev) { runs.push({ frame: f, color: c }); prev = c; }
    }

    if (runs.length === 1) {
      rects.push(`<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${runs[0].color}"/>`);
      continue;
    }

    const values = runs.map((r) => r.color).concat(runs[runs.length - 1].color);
    const keyTimes = runs.map((r) => kt[r.frame].toFixed(5)).concat('1');
    rects.push(
      `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${runs[0].color}">` +
      `<animate attributeName="fill" calcMode="discrete" ` +
      `values="${values.join(';')}" keyTimes="${keyTimes.join(';')}" ` +
      `dur="${TOTAL_DUR.toFixed(3)}s" repeatCount="indefinite"/></rect>`
    );
  }
}

const svg = `<svg width="${VIEW_WIDTH}" height="${VIEW_HEIGHT}" viewBox="0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${VIEW_WIDTH}" height="${VIEW_HEIGHT}" rx="8" fill="${BG}"/>
  ${rects.join('\n  ')}
</svg>
`;

fs.writeFileSync(path.join(__dirname, 'banner.svg'), svg);
console.log(
  'wrote banner.svg |', 'LEDs:', DISPLAY_COLS * ROWS,
  '| scroll frames:', M, '| total cycle:', TOTAL_DUR.toFixed(2) + 's',
  '| file size:', fs.statSync(path.join(__dirname, 'banner.svg')).size, 'bytes'
);
