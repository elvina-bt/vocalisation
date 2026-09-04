import type { StructuredElement } from './structure';

export type SpeechRate = 'lent' | 'normal' | 'rapide';

export const RATE_VALUES: Record<SpeechRate, number> = {
  lent: 0.75,
  normal: 1,
  rapide: 1.25,
};

export type ReaderState = 'idle' | 'reading' | 'paused' | 'done';

export function elementsToSpokenTexts(elements: StructuredElement[]): string[] {
  const texts: string[] = [];

  for (const el of elements) {
    if (el.type === 'title') {
      texts.push(`Titre. ${el.text}.`);
    } else if (el.type === 'paragraph') {
      texts.push(el.text);
    } else if (el.type === 'list') {
      texts.push('Liste.');
      el.items.forEach((item, i) => texts.push(`Élément ${i + 1}. ${item}.`));
    } else if (el.type === 'table') {
      texts.push('Tableau.');
      el.rows.forEach((row, i) => texts.push(`Ligne ${i + 1}. ${row.join(', ')}.`));
    }
  }

  return texts;
}

export function waitForVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      resolve([]);
      return;
    }
    const existing = window.speechSynthesis.getVoices();
    if (existing.length > 0) {
      resolve(existing);
      return;
    }
    const handler = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', handler);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener('voiceschanged', handler);
    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 1000);
  });
}

export function pickFrenchVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  return (
    voices.find((v) => v.lang?.toLowerCase().startsWith('fr-fr')) ||
    voices.find((v) => v.lang?.toLowerCase().startsWith('fr')) ||
    null
  );
}

export class ScreenReader {
  private texts: string[] = [];
  private index = 0;
  private rate = 1;
  private voice: SpeechSynthesisVoice | null = null;
  private onStateChange: (state: ReaderState, progress: { index: number; total: number }) => void;

  constructor(
    onStateChange: (state: ReaderState, progress: { index: number; total: number }) => void
  ) {
    this.onStateChange = onStateChange;
  }

  load(texts: string[], rate: SpeechRate, voice: SpeechSynthesisVoice | null) {
    this.texts = texts;
    this.index = 0;
    this.rate = RATE_VALUES[rate];
    this.voice = voice;
  }

  setRate(rate: SpeechRate) {
    this.rate = RATE_VALUES[rate];
  }

  start() {
    window.speechSynthesis.cancel();
    this.index = 0;
    this.speakNext();
  }

  private speakNext() {
    if (this.index >= this.texts.length) {
      this.onStateChange('done', { index: this.texts.length, total: this.texts.length });
      return;
    }

    const utterance = new SpeechSynthesisUtterance(this.texts[this.index]);
    utterance.lang = 'fr-FR';
    utterance.rate = this.rate;
    if (this.voice) utterance.voice = this.voice;

    utterance.onend = () => {
      this.index += 1;
      this.speakNext();
    };
    utterance.onerror = () => {
      this.index += 1;
      this.speakNext();
    };

    this.onStateChange('reading', { index: this.index, total: this.texts.length });
    window.speechSynthesis.speak(utterance);
  }

  pause() {
    window.speechSynthesis.pause();
    this.onStateChange('paused', { index: this.index, total: this.texts.length });
  }

  resume() {
    window.speechSynthesis.resume();
    this.onStateChange('reading', { index: this.index, total: this.texts.length });
  }

  stop() {
    window.speechSynthesis.cancel();
    this.index = this.texts.length;
    this.onStateChange('idle', { index: 0, total: this.texts.length });
  }

  replay() {
    this.start();
  }
}
