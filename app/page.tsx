'use client';

import { useEffect, useRef, useState } from 'react';
import { requestScreenStream, captureFrame } from '@/lib/capture';
import { recognizeImage } from '@/lib/ocr';
import { buildElements, StructuredElement } from '@/lib/structure';
import {
  ScreenReader,
  ReaderState,
  SpeechRate,
  elementsToSpokenTexts,
  waitForVoices,
  pickFrenchVoice,
} from '@/lib/speech';

type Phase = 'idle' | 'working' | 'reading' | 'paused' | 'done' | 'error';

export default function Home() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [statusText, setStatusText] = useState('Prêt à capturer votre écran.');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elements, setElements] = useState<StructuredElement[] | null>(null);
  const [rate, setRate] = useState<SpeechRate>('normal');
  const [supported, setSupported] = useState(true);

  const readerRef = useRef<ScreenReader | null>(null);

  useEffect(() => {
    const hasCapture = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;
    const hasSpeech = typeof window !== 'undefined' && !!window.speechSynthesis;
    setSupported(hasCapture && hasSpeech);

    readerRef.current = new ScreenReader((state: ReaderState) => {
      if (state === 'reading') {
        setPhase('reading');
        setStatusText('Lecture en cours…');
      } else if (state === 'paused') {
        setPhase('paused');
        setStatusText('Lecture en pause.');
      } else if (state === 'done') {
        setPhase('done');
        setStatusText('Lecture terminée.');
      } else if (state === 'idle') {
        setPhase('idle');
        setStatusText('Prêt à capturer votre écran.');
      }
    });

    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  async function handleCapture() {
    setErrorMessage(null);
    setElements(null);
    setPhase('working');

    try {
      setStatusText("Choisissez « Écran entier » dans la fenêtre qui s'ouvre…");
      const stream = await requestScreenStream();

      setStatusText('Capture en cours…');
      const dataUrl = await captureFrame(stream);

      setStatusText('Lecture du texte en cours (cela peut prendre quelques secondes)…');
      const words = await recognizeImage(dataUrl, (progress) => {
        setStatusText(`Analyse du texte… ${Math.round(progress * 100)}%`);
      });

      const els = buildElements(words);
      if (els.length === 0) {
        setPhase('error');
        setErrorMessage(
          "Aucun texte n'a été trouvé sur cette capture. Réessayez avec un écran contenant du texte à lire."
        );
        return;
      }

      setElements(els);
      const texts = elementsToSpokenTexts(els);
      const voices = await waitForVoices();
      const voice = pickFrenchVoice(voices);

      readerRef.current?.load(texts, rate, voice);
      readerRef.current?.start();
    } catch (err) {
      setPhase('error');
      const message = err instanceof Error ? err.message : 'Une erreur est survenue.';
      setErrorMessage(message);
    }
  }

  function handlePauseResume() {
    if (phase === 'reading') {
      readerRef.current?.pause();
    } else if (phase === 'paused') {
      readerRef.current?.resume();
    }
  }

  function handleStop() {
    readerRef.current?.stop();
  }

  function handleReplay() {
    readerRef.current?.replay();
  }

  function handleRateChange(newRate: SpeechRate) {
    setRate(newRate);
    readerRef.current?.setRate(newRate);
  }

  const isWorking = phase === 'working';
  const isReading = phase === 'reading';
  const isPaused = phase === 'paused';
  const canCaptureAgain = phase === 'idle' || phase === 'done' || phase === 'error';

  return (
    <main>
      <h1>🔊 Lecteur d&apos;écran vocal</h1>
      <p className="instructions">
        Appuyez sur le grand bouton, puis choisissez « Écran entier » dans la fenêtre qui
        s&apos;ouvre. Le texte affiché à l&apos;écran sera lu à voix haute.
      </p>

      {!supported && (
        <div className="status error" role="alert">
          Ce navigateur n&apos;est pas compatible avec cet outil. Merci d&apos;utiliser une
          version récente de Google Chrome.
        </div>
      )}

      <div className="rate-group" role="group" aria-label="Vitesse de lecture">
        <button
          type="button"
          className="rate-button"
          aria-pressed={rate === 'lent'}
          onClick={() => handleRateChange('lent')}
        >
          Lent
        </button>
        <button
          type="button"
          className="rate-button"
          aria-pressed={rate === 'normal'}
          onClick={() => handleRateChange('normal')}
        >
          Normal
        </button>
        <button
          type="button"
          className="rate-button"
          aria-pressed={rate === 'rapide'}
          onClick={() => handleRateChange('rapide')}
        >
          Rapide
        </button>
      </div>

      {canCaptureAgain && (
        <button
          type="button"
          className="big-button"
          onClick={handleCapture}
          disabled={!supported}
        >
          📸 Capturer et lire l&apos;écran
        </button>
      )}

      {(isReading || isPaused) && (
        <div className="controls-row">
          <button type="button" className="big-button secondary" onClick={handlePauseResume}>
            {isReading ? '⏸ Pause' : '▶ Reprendre'}
          </button>
          <button type="button" className="big-button stop secondary" onClick={handleStop}>
            ⏹ Arrêter
          </button>
        </div>
      )}

      {(isReading || isPaused || phase === 'done') && (
        <button type="button" className="big-button secondary" onClick={handleReplay}>
          🔁 Relire depuis le début
        </button>
      )}

      <div
        className={`status ${phase === 'error' ? 'error' : ''} ${phase === 'done' ? 'success' : ''}`}
        role="status"
        aria-live="polite"
      >
        {isWorking && <span aria-hidden="true">⏳ </span>}
        {statusText}
        {errorMessage && <div>{errorMessage}</div>}
      </div>

      {elements && <ExtractedText elements={elements} />}

      <footer>
        Astuce : pour un accès rapide, créez un raccourci de cette page sur le bureau ou dans le
        Dock depuis le menu de votre navigateur.
      </footer>
    </main>
  );
}

function ExtractedText({ elements }: { elements: StructuredElement[] }) {
  return (
    <section className="extracted-text" aria-label="Texte détecté sur la capture">
      <h2>Texte détecté</h2>
      {elements.map((el, i) => {
        if (el.type === 'title') {
          return (
            <p className="title-el" key={i}>
              {el.text}
            </p>
          );
        }
        if (el.type === 'paragraph') {
          return (
            <p className="paragraph-el" key={i}>
              {el.text}
            </p>
          );
        }
        if (el.type === 'list') {
          return (
            <ul key={i}>
              {el.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          );
        }
        if (el.type === 'table') {
          return (
            <table key={i}>
              <tbody>
                {el.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, c) => (
                      <td key={c}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          );
        }
        return null;
      })}
    </section>
  );
}
