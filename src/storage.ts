import { readablePhoto } from './imageInput.ts';
import { EMPTY, id, type Library, type Picture } from './model.ts';

let connection: Promise<IDBDatabase> | undefined;
function db() {
  if (!connection) connection = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('flores-personales', 1);
    request.onupgradeneeded = () => {
      for (const name of ['state', 'images']) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'id' });
    };
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); connection = undefined; }; resolve(request.result); };
    request.onerror = () => { connection = undefined; reject(request.error); };
    request.onblocked = () => { connection = undefined; reject(new Error('Cierra otras pestañas de Flores y vuelve a cargar.')); };
  });
  return connection;
}
export async function readPicture(imageId: string): Promise<Picture> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('images'); const req = tx.objectStore('images').get(imageId);
    req.onsuccess = () => req.result ? resolve(req.result) : reject(new Error('No se encuentra esta imagen en el dispositivo.'));
    req.onerror = () => reject(req.error);
  });
}
export async function persist(library: Library, pictures: Picture[] = []) {
  await updateLibrary(() => library, pictures);
}

export async function updateLibrary(update: (library: Library) => Library, pictures: Picture[] = []) {
  const database = await db();
  return new Promise<Library>((resolve, reject) => {
    const tx = database.transaction(['state', 'images'], 'readwrite');
    const state = tx.objectStore('state');
    const request = state.get('library');
    let next: Library;
    let failure: unknown;
    request.onsuccess = () => {
      try {
        next = update(request.result?.value ?? structuredClone(EMPTY));
        state.put({ id: 'library', value: next });
        for (const picture of pictures) tx.objectStore('images').add(picture);
      } catch (error) {
        failure = error;
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(next);
    tx.onabort = () => reject(failure ?? new Error('No se ha podido guardar. Comprueba el espacio del dispositivo. Tus datos anteriores se conservan.'));
  });
}
export async function loadLibrary(): Promise<Library> {
  const database = await db();
  const state = await new Promise<Library | undefined>((resolve, reject) => {
    const req = database.transaction('state').objectStore('state').get('library');
    req.onsuccess = () => resolve(req.result?.value); req.onerror = () => reject(req.error);
  });
  return state ?? structuredClone(EMPTY);
}

export async function prepareImage(file: File): Promise<Picture> {
  const original=await readablePhoto(file);
  const url = URL.createObjectURL(original);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error(`${file.name}: el navegador no consigue decodificar esta foto. Prueba con una captura de pantalla; si funciona, exporta la original como JPG o reduce su resolución.`)); image.src = url; });
    const resize = async (max: number) => {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const context = canvas.getContext('2d'); if (!context) throw new Error('No se puede procesar la imagen.');
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo preparar la foto.')), 'image/jpeg', .86));
    };
    return { id: id(), original, medium: await resize(1920), thumbnail: await resize(320), width: img.naturalWidth, height: img.naturalHeight };
  } finally { URL.revokeObjectURL(url); }
}
