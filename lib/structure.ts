import type { WordBox } from './ocr';

export type StructuredElement =
  | { type: 'title'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'table'; rows: string[][] };

interface LineInfo {
  block: number;
  par: number;
  line: number;
  text: string;
  top: number;
  height: number;
  left: number;
  words: WordBox[];
}

const BULLET_RE = /^([-•*▪●○–]|\d+[.)]|[a-zA-Z][.)])\s+/;

function groupLines(words: WordBox[]): LineInfo[] {
  const map = new Map<string, WordBox[]>();
  for (const w of words) {
    const key = `${w.block}-${w.par}-${w.line}`;
    const arr = map.get(key);
    if (arr) arr.push(w);
    else map.set(key, [w]);
  }

  const lines: LineInfo[] = [];
  for (const [key, ws] of map) {
    const sorted = [...ws].sort((a, b) => a.word - b.word);
    const [block, par, line] = key.split('-').map(Number);
    const top = Math.min(...sorted.map((w) => w.top));
    const bottom = Math.max(...sorted.map((w) => w.top + w.height));
    const left = Math.min(...sorted.map((w) => w.left));
    lines.push({
      block,
      par,
      line,
      text: sorted.map((w) => w.text).join(' '),
      top,
      height: bottom - top,
      left,
      words: sorted,
    });
  }

  lines.sort((a, b) => a.top - b.top);
  return lines;
}

function clusterColumns(words: WordBox[]): string[] {
  const sorted = [...words].sort((a, b) => a.left - b.left);
  const avgCharWidth =
    sorted.reduce((sum, w) => sum + w.width / Math.max(w.text.length, 1), 0) / sorted.length;
  const gapThreshold = avgCharWidth * 3.5;

  const clusters: WordBox[][] = [];
  let current: WordBox[] = [];
  let lastRight = -Infinity;

  for (const w of sorted) {
    if (current.length > 0 && w.left - lastRight > gapThreshold) {
      clusters.push(current);
      current = [];
    }
    current.push(w);
    lastRight = w.left + w.width;
  }
  if (current.length) clusters.push(current);

  return clusters.map((c) => c.map((w) => w.text).join(' '));
}

function detectTable(parLines: LineInfo[]): string[][] | null {
  if (parLines.length < 2) return null;

  const rows = parLines.map((l) => clusterColumns(l.words));
  const maxCols = Math.max(...rows.map((r) => r.length));
  if (maxCols < 2) return null;

  const consistentRows = rows.filter((r) => r.length === maxCols).length;
  if (consistentRows / rows.length < 0.6) return null;

  return rows;
}

export function buildElements(words: WordBox[]): StructuredElement[] {
  const lines = groupLines(words);
  if (lines.length === 0) return [];

  const heights = lines.map((l) => l.height).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)] || 1;

  const byPar = new Map<string, LineInfo[]>();
  for (const l of lines) {
    const key = `${l.block}-${l.par}`;
    const arr = byPar.get(key);
    if (arr) arr.push(l);
    else byPar.set(key, [l]);
  }

  const parGroups = [...byPar.values()].sort(
    (a, b) => Math.min(...a.map((l) => l.top)) - Math.min(...b.map((l) => l.top))
  );

  const elements: StructuredElement[] = [];

  for (const parLines of parGroups) {
    parLines.sort((a, b) => a.top - b.top);

    if (parLines.length === 1 && parLines[0].height > medianHeight * 1.25) {
      elements.push({ type: 'title', text: parLines[0].text });
      continue;
    }

    const bulletLines = parLines.filter((l) => BULLET_RE.test(l.text));
    if (bulletLines.length >= Math.max(2, Math.ceil(parLines.length * 0.6))) {
      elements.push({
        type: 'list',
        items: parLines.map((l) => l.text.replace(BULLET_RE, '').trim()).filter(Boolean),
      });
      continue;
    }

    const table = detectTable(parLines);
    if (table) {
      elements.push({ type: 'table', rows: table });
      continue;
    }

    elements.push({ type: 'paragraph', text: parLines.map((l) => l.text).join(' ') });
  }

  return elements;
}
