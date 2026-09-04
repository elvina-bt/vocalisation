export async function requestScreenStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error(
      "Ce navigateur ne permet pas de capturer l'écran. Merci d'utiliser une version récente de Chrome, Edge ou Safari."
    );
  }
  return navigator.mediaDevices.getDisplayMedia({ video: true });
}

export async function captureFrame(stream: MediaStream): Promise<string> {
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

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Impossible de préparer l\'image capturée.');
  }
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  stream.getTracks().forEach((track) => track.stop());

  return canvas.toDataURL('image/png');
}
