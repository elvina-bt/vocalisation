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

  return { dataUrl: canvas.toDataURL('image/png'), width, height };
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
