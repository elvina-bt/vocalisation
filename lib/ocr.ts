import { createWorker } from 'tesseract.js';

export interface WordBox {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  block: number;
  par: number;
  line: number;
  word: number;
  conf: number;
}

export async function recognizeImage(
  dataUrl: string,
  onProgress?: (progress: number) => void
): Promise<WordBox[]> {
  const worker = await createWorker('fra', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(m.progress);
      }
    },
  });

  try {
    const { data } = await worker.recognize(dataUrl, {}, { tsv: true });
    return parseTsv(data.tsv ?? '');
  } finally {
    await worker.terminate();
  }
}

function parseTsv(tsv: string): WordBox[] {
  const lines = tsv.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const header = lines[0].split('\t');
  const colIndex = (name: string) => header.indexOf(name);

  const iLevel = colIndex('level');
  const iBlock = colIndex('block_num');
  const iPar = colIndex('par_num');
  const iLine = colIndex('line_num');
  const iWord = colIndex('word_num');
  const iLeft = colIndex('left');
  const iTop = colIndex('top');
  const iWidth = colIndex('width');
  const iHeight = colIndex('height');
  const iConf = colIndex('conf');
  const iText = colIndex('text');

  const words: WordBox[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split('\t');
    if (Number(cells[iLevel]) !== 5) continue; // seul le niveau "mot" nous intéresse

    const text = cells[iText] ?? '';
    if (!text.trim()) continue;

    words.push({
      text,
      left: Number(cells[iLeft]) || 0,
      top: Number(cells[iTop]) || 0,
      width: Number(cells[iWidth]) || 0,
      height: Number(cells[iHeight]) || 0,
      block: Number(cells[iBlock]) || 0,
      par: Number(cells[iPar]) || 0,
      line: Number(cells[iLine]) || 0,
      word: Number(cells[iWord]) || 0,
      conf: Number(cells[iConf]) || 0,
    });
  }

  return words;
}
