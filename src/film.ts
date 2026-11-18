export type Clip = {
  imageId: string;
  seconds: number;
  zoom: number;
  pace: number;
  x: number;
  y: number;
  inset?: { x: number; y: number; area: number };
};
export type Film = { orientation: 'horizontal' | 'vertical'; clips: Clip[] };
type Rect = { x: number; y: number; w: number; h: number };
type Camera = { x: number; y: number; scale: number };

export const newClip = (imageId: string): Clip => ({ imageId, seconds: 5, zoom: 1.55, pace: 1, x: .5, y: .5 });
export function defaultFilm(images: string[]): Film {
  const clips = images.map(newClip);
  if (clips.length >= 4) clips[2].inset = { x: .06, y: .07, area: .2 };
  return { orientation: 'horizontal', clips };
}
export const dimensions = (film: Film) => film.orientation === 'vertical' ? [1080, 1920] : [1920, 1080];
export const duration = (film: Film) => film.clips.reduce((sum, clip) => sum + clip.seconds, 0);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const bound = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const ease = (t: number, pace = 1) => {
  const smooth = t * t * (3 - 2 * t);
  return smooth * pace / (smooth * pace + 1 - smooth);
};
const identity: Camera = { x: 0, y: 0, scale: 1 };
const transitionLayers = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();

function focusOffset(anchor: number, start: number, length: number, viewport: number, scale: number) {
  const origin = start * scale, size = length * scale;
  if (size < viewport) return (viewport - size) / 2 - origin;
  return bound(viewport / 2 - anchor * scale, viewport - origin - size, -origin);
}

function fit(image: HTMLImageElement, rect: Rect, fill: boolean): Rect {
  const ratioX = rect.w / image.naturalWidth, ratioY = rect.h / image.naturalHeight;
  const factor = fill ? Math.max(ratioX, ratioY) : Math.min(ratioX, ratioY);
  const w = image.naturalWidth * factor, h = image.naturalHeight * factor;
  return { x: rect.x + (rect.w - w) / 2, y: rect.y + (rect.h - h) / 2, w, h };
}

export function insetRect(host: Rect, aspect: number, inset: NonNullable<Clip['inset']>): Rect {
  const w = Math.min(Math.sqrt(host.w * host.h * inset.area * aspect), host.w, host.h * aspect);
  const h = w / aspect;
  return {
    x: host.x + host.w * bound(inset.x, 0, 1 - w / host.w),
    y: host.y + host.h * bound(inset.y, 0, 1 - h / host.h), w, h,
  };
}

export function blendCamera(start: Camera, end: Camera, fraction: number): Camera {
  const scale = start.scale * (end.scale / start.scale) ** fraction;
  return {
    scale,
    x: mix(start.x / start.scale, end.x / end.scale, fraction) * scale,
    y: mix(start.y / start.scale, end.y / end.scale, fraction) * scale,
  };
}

export function drawFilm(canvas: HTMLCanvasElement, film: Film, images: Map<string, HTMLImageElement>, seconds: number) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width, h = canvas.height;
  const frame = { x: 0, y: 0, w, h };
  const clips = film.clips;
  const imagesByClip = clips.map(c => images.get(c.imageId));
  function photoRect(index: number, rect: Rect) {
    const image = imagesByClip[index];
    return image && !clips[index - 1]?.inset ? fit(image, rect, false) : rect;
  }
  function endZoom(index: number): Camera {
    if (clips[index - 1]?.inset) return identity;
    const clip = clips[index], rect = photoRect(index, frame);
    return {
      scale: clip.zoom,
      x: focusOffset(rect.x + rect.w * clip.x, rect.x, rect.w, w, clip.zoom),
      y: focusOffset(rect.y + rect.h * clip.y, rect.y, rect.h, h, clip.zoom),
    };
  }
  function scene(context: CanvasRenderingContext2D, index: number, rect: Rect): void {
    const image = imagesByClip[index];
    context.fillStyle = '#091619';
    context.fillRect(rect.x, rect.y, rect.w, rect.h);
    if (!image) return;
    const imageRect = fit(image, rect, !!clips[index - 1]?.inset);
    const host = photoRect(index, rect);
    context.save();
    context.beginPath();
    context.rect(rect.x, rect.y, rect.w, rect.h);
    context.clip();
    context.drawImage(image, imageRect.x, imageRect.y, imageRect.w, imageRect.h);
    const inset = clips[index].inset;
    if (inset && clips[index + 1]) {
      const child = insetRect(host, w / h, inset);
      if (child.w * context.getTransform().a >= 1) scene(context, index + 1, child);
    }
    context.restore();
  }
  function paint(context: CanvasRenderingContext2D, index: number, camera: Camera) {
    context.save();
    context.setTransform(camera.scale, 0, 0, camera.scale, camera.x, camera.y);
    scene(context, index, frame);
    context.restore();
  }

  ctx.fillStyle = '#091619';
  ctx.fillRect(0, 0, w, h);
  if (!clips.length) return;
  let index = 0;
  let elapsed = Math.max(0, seconds);
  while (index < clips.length - 1 && elapsed >= clips[index].seconds) elapsed -= clips[index++].seconds;
  const clip = clips[index], previous = clips[index - 1];
  const t = bound(elapsed / clip.seconds, 0, 1);
  const lead = (from: Clip, to: Clip) => Math.min(.6, from.seconds * .3, to.seconds * .22);
  const initialMotion = previous && !previous.inset ? lead(previous, clip) / clip.seconds : 0;
  const zoomFraction = ease(mix(initialMotion, 1, t), clip.pace);
  const camera = blendCamera(identity, endZoom(index), zoomFraction);
  if (previous?.inset && t < 1) {
    const child = insetRect(photoRect(index - 1, frame), w / h, previous.inset);
    const scale = w / child.w;
    const target = { x: -child.x * scale, y: -child.y * scale, scale };
    paint(ctx, index - 1, blendCamera(endZoom(index - 1), target, ease(t, clip.pace)));
  } else {
    paint(ctx, index, previous?.inset ? identity : camera);
  }
  const next = clips[index + 1];
  if (next && !clip.inset) {
    const fade = lead(clip, next);
    const progress = bound((elapsed - clip.seconds + fade) / fade, 0, 1);
    if (progress <= 0) return;
    let layer = transitionLayers.get(canvas);
    if (!layer) {
      layer = canvas.ownerDocument.createElement('canvas');
      transitionLayers.set(canvas, layer);
    }
    if (layer.width !== w || layer.height !== h) { layer.width = w; layer.height = h; }
    const overlay = layer.getContext('2d');
    if (!overlay) return;
    overlay.fillStyle = '#091619';
    overlay.fillRect(0, 0, w, h);
    paint(overlay, index + 1, blendCamera(identity, endZoom(index + 1), ease(progress * fade / next.seconds, next.pace)));
    ctx.save();
    ctx.globalAlpha = ease(progress);
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
  }
}
