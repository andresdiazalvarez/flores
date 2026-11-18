import { drawFilm, dimensions, duration, type Film } from './film';

export async function exportFilm(film: Film, images: Map<string, HTMLImageElement>, signal: AbortSignal, progress: (value: number) => void) {
  const { BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality, canEncodeVideo } = await import('mediabunny');
  const [width, height] = dimensions(film);
  const quality = new Quality({ bitrate: 14_000_000 });
  const codec = 'avc';
  if (!await canEncodeVideo(codec, { width, height, quality })) {
    throw new Error('Este dispositivo no ofrece codificación H.264. Abre Flores en una versión reciente de Edge o Chrome.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const target = new BufferTarget();
  const output = new Output({ target, format: new Mp4OutputFormat() });
  const source = new CanvasSource(canvas, { codec, quality });
  const fps = 30;
  const total = duration(film);
  const frames = Math.round(total * fps);
  output.addVideoTrack(source, { frameRate: fps });

  try {
    if (signal.aborted) throw new Error('Exportación cancelada.');
    await output.start();
    for (let index = 0; index < frames; index++) {
      if (signal.aborted) throw new Error('Exportación cancelada.');
      const timestamp = index / fps;
      const position = index === frames - 1 ? total : timestamp;
      drawFilm(canvas, film, images, position);
      await source.add(timestamp, 1 / fps);
      if ((index + 1) % 12 === 0 || index === frames - 1) {
        progress((index + 1) / frames);
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }
    if (signal.aborted) throw new Error('Exportación cancelada.');
    source.close();
    await output.finalize();
    if (!target.buffer?.byteLength) throw new Error('El vídeo resultó vacío.');
    return new Blob([target.buffer], { type: 'video/mp4' });
  } catch (error) {
    await output.cancel().catch(() => {});
    if (signal.aborted) throw new Error('Exportación cancelada.');
    if (error instanceof Error && error.message === 'El vídeo resultó vacío.') throw error;
    throw new Error('No se pudo codificar el MP4 H.264.', { cause: error });
  }
}
