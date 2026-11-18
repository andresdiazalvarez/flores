import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { flowerRows, EMPTY, PHOTO_SIZE, WORLD } from '../src/model.ts';
import { persist, loadLibrary, updateLibrary } from '../src/storage.ts';

function makeLibrary() {
  const points = [
    { id: 'cadiz-1', name: 'Cádiz', date: '2026-11-06', coords: [-6, 36], view: WORLD },
    { id: 'cadiz-2', name: 'Cádiz', date: '2026-11-05', coords: [-6, 36], view: WORLD },
    { id: 'conil-1', name: 'Conil', date: '2026-11-06', coords: [-6.14, 36.28], view: WORLD },
  ];
  const panoramas = points.map((point, index) => ({
    id: 'pano-' + index, pointId: point.id, backgrounds: ['fondo-' + index], direction: 0, created: index,
  }));
  panoramas.push({ ...panoramas[0], id: 'pano-alternativa', backgrounds: ['otro-fondo'], created: 3 });
  const photos = [panoramas[0], panoramas[1], panoramas[2], panoramas[3]].map((panorama, index) => ({
    id: 'foto-' + index,
    imageId: 'img-' + index,
    panoramaId: panorama.id,
    date: points.find(point => point.id === panorama.pointId).date,
    text: '',
    direction: .3 + index * .1,
    y: .4,
    size: PHOTO_SIZE,
    isFlower: true,
    flowerName: 'Orquídea silvestre',
  }));
  photos.push({ ...photos[0], id: 'foto-sin-clasificar', text: 'Orquídea', isFlower: false });
  return { ...structuredClone(EMPTY), points, panoramas, photos };
}

test('busca sin tildes y conserva coincidencias de nombre, fecha y lugar', () => {
  const library = makeLibrary();
  assert.equal(flowerRows(library, 'ORQUIDEA').length, 4);
  assert.equal(flowerRows(library, 'orquídea', '2026-11-06').length, 3);
  assert.equal(flowerRows(library, 'orquidea', '', 'CADIZ').length, 3);
  assert.equal(flowerRows(library, '', '', 'Madrid').length, 0);
  const results = flowerRows(library, 'orquídea', '2026-11-06', 'Cádiz');
  assert.deepEqual(results.map(row => [row.photo.id, row.panorama.id, row.point.id]), [
    ['foto-0', 'pano-0', 'cadiz-1'],
    ['foto-3', 'pano-alternativa', 'cadiz-1'],
  ]);
});

test('persiste el cambio de nombre y la retirada de la clasificación', async () => {
  const library = makeLibrary();
  await persist(library);
  assert.deepEqual(await loadLibrary(), library);
  await updateLibrary(current => ({
    ...current,
    photos: current.photos.map(photo => {
      if (photo.id === 'foto-0') return { ...photo, isFlower: false, flowerName: '' };
      if (photo.id === 'foto-1') return { ...photo, flowerName: 'Orquídea blanca' };
      return photo;
    }),
  }));
  const saved = await loadLibrary();
  assert.equal(saved.photos.length, library.photos.length);
  assert.equal(flowerRows(saved).length, 3);
  assert.equal(flowerRows(saved, 'BLANCA')[0].photo.id, 'foto-1');
});

test('dos guardados simultáneos conservan ambas fotos y Flores usa su propia base', async () => {
  const initial = makeLibrary();
  await persist({ ...initial, photos: [] });
  await Promise.all(initial.photos.slice(0, 2).map(photo =>
    updateLibrary(current => ({ ...current, photos: [...current.photos, photo] })),
  ));
  assert.deepEqual((await loadLibrary()).photos, initial.photos.slice(0, 2));
  assert.deepEqual((await indexedDB.databases()).map(database => database.name), ['flores-personales']);
});
