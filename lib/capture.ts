export async function requestScreenStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error(
      "Ce navigateur ne permet pas de capturer l'écran. Merci d'utiliser une version récente de Chrome, Edge ou Safari."
    );
  }
  return navigator.mediaDevices.getDisplayMedia({ video: true });
}

export interface CapturedFrame {
  dataUrl: string;
  width: number;
  height: number;
}

export async function captureFrame(stream: MediaStream): Promise<CapturedFrame> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Impossible de lire le flux de l'écran."));
  });

  await video.play();
  // Laisse le temps au premier vrai cadre de s'afficher.
  await new Promise((resolve) => setTimeout(resolve, 300));

  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Impossible de préparer l\'image capturée.');
  }
  ctx.drawImage(video, 0, 0, width, height);

  stream.getTracks().forEach((track) => track.stop());

  if (isLikelyBlankFrame(ctx, width, height)) {
    throw new Error(
      "La capture semble vide ou uniformément noire. Sur Mac, ouvrez Réglages Système > " +
        'Confidentialité et sécurité > Enregistrement d\'écran, activez votre navigateur dans ' +
        'la liste, puis redémarrez-le et réessayez.'
    );
  }

  return { dataUrl: canvas.toDataURL('image/png'), width, height };
}

// Détecte une image quasiment unie (typiquement un écran noir renvoyé quand le
// navigateur n'a pas la permission système d'enregistrer l'écran, sur Mac notamment).
function isLikelyBlankFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): boolean {
  const { data } = ctx.getImageData(0, 0, width, height);
  const totalPixels = width * height;
  const targetSamples = 5000;
  const step = Math.max(1, Math.floor(totalPixels / targetSamples));

  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let p = 0; p < totalPixels; p += step) {
    const idx = p * 4;
    const luminance = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    sum += luminance;
    sumSq += luminance * luminance;
    count += 1;
  }

  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  return variance < 4;
}

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function cropImage(dataUrl: string, rect: CropRect): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(rect.w));
      canvas.height = Math.max(1, Math.round(rect.h));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Impossible de préparer la zone sélectionnée.'));
        return;
      }
      ctx.drawImage(
        img,
        rect.x,
        rect.y,
        rect.w,
        rect.h,
        0,
        0,
        canvas.width,
        canvas.height
      );
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error("Impossible de charger l'image capturée."));
    img.src = dataUrl;
  });
}
