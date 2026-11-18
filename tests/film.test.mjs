import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultFilm, dimensions, drawFilm, duration, insetRect } from '../src/film.ts';

test('cuatro fotografías crean un recorrido de 20 s con la cuarta insertada arriba a la izquierda', () => {
  const film = defaultFilm(['a', 'b', 'c', 'd']);
  assert.equal(duration(film), 20);
  assert.deepEqual(dimensions(film), [1920, 1080]);
  assert.deepEqual(dimensions({ ...film, orientation: 'vertical' }), [1080, 1920]);
  const host = { x: 0, y: 0, w: 1920, h: 1080 };
  const inset = insetRect(host, 16 / 9, film.clips[2].inset);
  assert.ok(inset.x < host.w * .1 && inset.y < host.h * .1);
  assert.ok(Math.abs(inset.w * inset.h / (host.w * host.h) - .2) < 1e-9);
});

function capture(film, seconds) {
  const draws = [], stack = [];
  let transform = [1, 0, 0];
  const ctx = {
    save() { stack.push(transform); },
    restore() { transform = stack.pop(); },
    setTransform(scale, _b, _c, _d, x, y) { transform = [scale, x, y]; },
    getTransform() { return { a: transform[0] }; },
    beginPath() {}, rect() {}, clip() {}, fillRect() {},
    drawImage(image, x, y, w, h) {
      const [scale, tx, ty] = transform;
      draws.push({ id: image.id, rect: [x * scale + tx, y * scale + ty, w * scale, h * scale] });
    },
  };
  const images = new Map(film.clips.map(clip => [
    clip.imageId,
    { id: clip.imageId, naturalWidth: 1920, naturalHeight: 1080 },
  ]));
  drawFilm({ width: 1920, height: 1080, getContext: () => ctx }, film, images, seconds);
  return draws;
}

test('el acercamiento a la foto insertada avanza desde el encuadre previo y llega sin salto', () => {
  const film = defaultFilm(['a', 'b', 'c', 'd']);
  assert.deepEqual(capture(film, 0), [{ id: 'a', rect: [0, 0, 1920, 1080] }]);
  assert.ok(capture(film, 15).at(-1).rect[2] < capture(film, 17.5).at(-1).rect[2]);
  const almost = capture(film, 19.999).at(-1);
  assert.equal(almost.id, 'd');
  const full = capture(film, 20).at(-1);
  assert.deepEqual(full, { id: 'd', rect: [0, 0, 1920, 1080] });
  almost.rect.forEach((value, index) => assert.ok(Math.abs(value - full.rect[index]) < .005));
});

test('encadenar entradas conserva el encuadre entre la cuarta y la quinta fotografía', () => {
  const film = defaultFilm(['a', 'b', 'c', 'd', 'e']);
  film.clips[3].inset = { x: .5, y: .4, area: .15 };
  const before = capture(film, 19.999).find(draw => draw.id === 'd');
  const after = capture(film, 20).find(draw => draw.id === 'd');
  before.rect.forEach((value, index) => assert.ok(Math.abs(value - after.rect[index]) < .005));
  assert.deepEqual(capture(film, 25).at(-1), { id: 'e', rect: [0, 0, 1920, 1080] });
});
