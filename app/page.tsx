'use client';

import { useEffect, useRef, useState } from 'react';
import { requestScreenStream, captureFrame, cropImage, CropRect } from '@/lib/capture';
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

type Phase = 'idle' | 'working' | 'preview' | 'reading' | 'paused' | 'done' | 'error';

export default function Home() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [statusText, setStatusText] = useState('Prêt à capturer votre écran.');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elements, setElements] = useState<StructuredElement[] | null>(null);
  const [rate, setRate] = useState<SpeechRate>('normal');
  const [supported, setSupported] = useState(true);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

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
    setCapturedImage(null);
    setPhase('working');

    try {
      setStatusText("Choisissez « Écran entier » dans la fenêtre qui s'ouvre…");
      const stream = await requestScreenStream();

      setStatusText('Capture en cours…');
      const { dataUrl } = await captureFrame(stream);

      setCapturedImage(dataUrl);
      setStatusText('Capture prête.');
      setPhase('preview');
    } catch (err) {
      setPhase('error');
      const message = err instanceof Error ? err.message : 'Une erreur est survenue.';
      setErrorMessage(message);
    }
  }

  async function processImage(dataUrl: string, sourceLabel: string) {
    setPhase('working');
    try {
      setStatusText('Lecture du texte en cours (cela peut prendre quelques secondes)…');
      const words = await recognizeImage(dataUrl, (progress) => {
        setStatusText(`Analyse du texte… ${Math.round(progress * 100)}%`);
      });

      const els = buildElements(words);
      if (els.length === 0) {
        setPhase('error');
        setErrorMessage(
          `Aucun texte n'a été trouvé sur ${sourceLabel}. Réessayez avec une capture ou une sélection contenant du texte.`
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

  function handleReadAll() {
    if (capturedImage) processImage(capturedImage, "l'écran entier");
  }

  async function handleReadSelection(rect: CropRect) {
    if (!capturedImage) return;
    try {
      const cropped = await cropImage(capturedImage, rect);
      await processImage(cropped, 'la zone sélectionnée');
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
  const isPreview = phase === 'preview';
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

      {isPreview && capturedImage && (
        <CropSelector
          imageUrl={capturedImage}
          onReadAll={handleReadAll}
          onReadSelection={handleReadSelection}
        />
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

interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function CropSelector({
  imageUrl,
  onReadAll,
  onReadSelection,
}: {
  imageUrl: string;
  onReadAll: () => void;
  onReadSelection: (rect: CropRect) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [rect, setRect] = useState<ScreenRect | null>(null);

  function getRelativePoint(e: React.PointerEvent) {
    const bounds = imgRef.current!.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - bounds.left, 0), bounds.width);
    const y = Math.min(Math.max(e.clientY - bounds.top, 0), bounds.height);
    return { x, y };
  }

  function handlePointerDown(e: React.PointerEvent) {
    const point = getRelativePoint(e);
    dragStart.current = point;
    setRect({ x: point.x, y: point.y, w: 0, h: 0 });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragStart.current) return;
    const point = getRelativePoint(e);
    const start = dragStart.current;
    setRect({
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      w: Math.abs(point.x - start.x),
      h: Math.abs(point.y - start.y),
    });
  }

  function handlePointerUp() {
    dragStart.current = null;
    setRect((r) => (r && r.w > 10 && r.h > 10 ? r : null));
  }

  function handleConfirmSelection() {
    if (!rect || !imgRef.current) return;
    const img = imgRef.current;
    const scaleX = img.naturalWidth / img.clientWidth;
    const scaleY = img.naturalHeight / img.clientHeight;
    onReadSelection({
      x: rect.x * scaleX,
      y: rect.y * scaleY,
      w: rect.w * scaleX,
      h: rect.h * scaleY,
    });
  }

  const hasSelection = !!rect && rect.w > 10 && rect.h > 10;

  return (
    <div>
      <p className="instructions">
        Vous pouvez délimiter à la souris une zone précise à lire, ou lire l&apos;écran entier
        directement.
      </p>
      <div
        className="crop-container"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <img
          ref={imgRef}
          src={imageUrl}
          alt="Capture d'écran"
          className="crop-image"
          draggable={false}
        />
        {rect && <div className="crop-selection" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />}
      </div>
      <button type="button" className="big-button" onClick={onReadAll}>
        🔊 Lire tout l&apos;écran
      </button>
      {hasSelection && (
        <button type="button" className="big-button secondary" onClick={handleConfirmSelection}>
          ✂️ Lire seulement la zone sélectionnée
        </button>
      )}
    </div>
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
