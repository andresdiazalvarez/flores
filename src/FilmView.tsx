import { useEffect, useRef, useState } from 'react';
import { defaultFilm, dimensions, drawFilm, duration, newClip, type Clip, type Film } from './film';
import { exportFilm } from './filmExport';
import { prepareImage, readPicture } from './storage';
import PhotoImage from './PhotoImage';
import type { Panorama, Picture, PlacedPhoto } from './model';

type Props = {
  panorama?: Panorama;
  title: string;
  photos: PlacedPhoto[];
  selectedPhoto?: string;
  save: (film: Film, images: Picture[]) => Promise<void>;
  back: () => void;
  addPhoto: () => void;
  openPhoto: (photo: PlacedPhoto) => void;
  editPhoto: (photo: PlacedPhoto) => void;
};

export default function FilmView(props: Props) {
  const [film, setFilm] = useState(() => props.panorama?.film ?? defaultFilm(props.panorama?.backgrounds ?? []));
  const [pending, setPending] = useState<Picture[]>([]);
  const [editing, setEditing] = useState(!props.panorama);
  const [selected, setSelected] = useState(0);
  const [time, setTime] = useState(props.selectedPhoto ? duration(film) : 0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [images, setImages] = useState<Map<string, HTMLImageElement>>(new Map());
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<number>();
  const [pick, setPick] = useState<'focus' | 'inset'>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const playhead = useRef(time);
  const exporter = useRef<AbortController | null>(null);
  const dragged = useRef<number | null>(null);
  const clip = film.clips[selected];
  const total = duration(film);
  const ids = JSON.stringify([...new Set(film.clips.map(c => c.imageId))].sort());
  const [width, height] = dimensions(film);
  const ready = film.clips.length > 0 && film.clips.every(c => images.has(c.imageId));
  const done = ready && !playing && time >= total;
  const locked = busy || progress !== undefined;

  useEffect(() => {
    let active = true;
    const urls: string[] = [];
    setLoading(true);
    const decode = async (imageId: string) => {
      const picture = pending.find(p => p.id === imageId) ?? await readPicture(imageId);
      if (!active) return;
      const url = URL.createObjectURL(picture.original);
      urls.push(url);
      const img = new Image();
      img.src = url;
      await img.decode();
      return [imageId, img] as const;
    };
    Promise.all((JSON.parse(ids) as string[]).map(decode)).then(entries => {
      if (active) setImages(new Map(entries.filter(entry => entry !== undefined)));
    }).catch(() => { if (active) setStatus('No se pudo abrir una imagen del recorrido.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [ids, pending]);

  useEffect(() => {
    if (props.selectedPhoto) {
      playhead.current = total;
      setTime(total);
      setPlaying(false);
    }
  }, [props.selectedPhoto, total]);

  useEffect(() => {
    if (canvas.current && !playing) drawFilm(canvas.current, film, images, time);
  }, [film, images, time, playing]);

  useEffect(() => {
    if (!playing) return;
    const start = performance.now() - playhead.current * 1000;
    let frame = 0, lastUpdate = -1;
    const tick = (now: number) => {
      const value = Math.min(total, (now - start) / 1000);
      playhead.current = value;
      if (canvas.current) drawFilm(canvas.current, film, images, value);
      if (value - lastUpdate >= .08 || value === total) {
        lastUpdate = value;
        setTime(value);
      }
      if (value < total) frame = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, total, film, images]);

  useEffect(() => () => exporter.current?.abort(), []);

  function seek(value: number) {
    setPlaying(false);
    playhead.current = value;
    setTime(value);
  }

  async function load(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    setStatus('');
    try {
      const pictures: Picture[] = [];
      for (const file of files) pictures.push(await prepareImage(file));
      setPending(current => [...current, ...pictures]);
      const newItems = pictures.map(p => p.id);
      setFilm(current => {
        const clips = [...current.clips, ...newItems.map(newClip)];
        if (!props.panorama && current.clips.length < 4 && clips.length >= 4) {
          clips[2] = { ...clips[2], inset: { x: .06, y: .07, area: .2 } };
        }
        return { ...current, clips };
      });
      seek(0);
    } catch (error) { setStatus((error as Error).message); }
    finally { setBusy(false); }
  }

  function shift(from: number, to: number) {
    if (from === to || !film.clips[to]) return;
    const clips = [...film.clips];
    const [item] = clips.splice(from, 1);
    clips.splice(to, 0, item);
    setFilm({ ...film, clips });
    setSelected(to);
    seek(0);
  }

  function update(values: Partial<Clip>) {
    setFilm(current => ({ ...current, clips: current.clips.map((value, index) => index === selected ? { ...value, ...values } : value) }));
  }

  function select(index: number) {
    setSelected(index);
    setPick(undefined);
    seek(film.clips.slice(0, index).reduce((sum, value) => sum + value.seconds, 0));
  }

  async function save() {
    setStatus('');
    setBusy(true);
    try {
      await props.save(film, pending.filter(picture => film.clips.some(item => item.imageId === picture.id)));
      setPending([]);
      setEditing(false);
      setStatus('Recorrido guardado.');
    } catch (error) { setStatus((error as Error).message); }
    finally { setBusy(false); }
  }

  async function download() {
    setStatus('');
    seek(0);
    const controller = new AbortController();
    exporter.current = controller;
    setProgress(0);
    try {
      const video = await exportFilm(film, images, controller.signal, setProgress);
      const url = URL.createObjectURL(video);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'flores-recorrido.mp4';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus('Vídeo MP4 descargado.');
    } catch (error) { setStatus((error as Error).message); }
    finally { exporter.current = null; setProgress(undefined); }
  }

  const range = (label: string, value: number, min: number, max: number, step: number, change: (value: number) => void) =>
    <label>{label} <output>{Math.round(value * 100) / 100}</output><input type="range" min={min} max={max} step={step} value={value} onChange={event => change(Number(event.target.value))}/></label>;
  const source = clip && images.get(clip.imageId)?.src;
  const inserted = !!film.clips[selected - 1]?.inset;

  return <section className="film-page">
    <header><h1>{editing ? 'Editar recorrido' : props.title || 'Recorrido cinematográfico'}</h1>
      {!editing && <button onClick={() => { seek(0); setEditing(true); }} disabled={locked}>Editar recorrido</button>}
    </header>
    <div className="film-preview">
      <canvas ref={canvas} width={width} height={height} aria-label="Vista previa del recorrido"/>
      {!film.clips.length && <p>Carga fotografías para crear el recorrido.</p>}
    </div>
    <div className="film-actions">
      <button disabled={!ready || locked || loading} onClick={() => {
        if (playing) { seek(playhead.current); return; }
        if (time >= total) seek(0);
        setPlaying(true);
      }}>{playing ? 'Pausar' : time >= total ? 'Repetir' : 'Reproducir'}</button>
      <label className="film-time"><span>{time.toFixed(1).replace('.', ',')} / {total} s</span>
        <input aria-label="Posición de reproducción" type="range" min={0} max={total || 1} step="0.01" value={Math.min(time, total)} disabled={!ready || locked} onChange={event => seek(Number(event.target.value))}/>
      </label>
      <button disabled={!ready || locked || loading} onClick={() => void download()}>Exportar MP4</button>
      {progress !== undefined && <><progress value={progress} max={1} aria-label="Exportando MP4"/><button onClick={() => exporter.current?.abort()}>Cancelar exportación</button></>}
    </div>
    {progress !== undefined && <p role="status">Generando el MP4 a 30 fotogramas por segundo.</p>}
    {status && <p role="status">{status}</p>}

    {editing && <fieldset className="film-editor" disabled={locked}>
      <legend>Fotografías del recorrido</legend>
      <label>Cargar fotografías<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => {
        const files = Array.from(event.currentTarget.files ?? []);
        event.currentTarget.value = '';
        void load(files);
      }}/></label>
      <label>Formato<select value={film.orientation} onChange={event => setFilm({ ...film, orientation: event.target.value as Film['orientation'] })}>
        <option value="horizontal">Horizontal · 1920 × 1080</option><option value="vertical">Vertical · 1080 × 1920</option>
      </select></label>
      <ol className="film-clips">{film.clips.map((item, index) => <li key={item.imageId} draggable
        onDragStart={event => { dragged.current = index; event.dataTransfer.setData('text/plain', String(index)); }}
        onDragOver={event => event.preventDefault()}
        onDrop={event => { event.preventDefault(); if (dragged.current !== null) shift(dragged.current, index); dragged.current = null; }}
        onDragEnd={() => { dragged.current = null; }}>
        <button aria-pressed={index === selected} onClick={() => select(index)}>
          {images.get(item.imageId) && <img draggable={false} src={images.get(item.imageId)?.src} alt=""/>}
          Foto {index + 1} · {item.seconds} s
        </button>
        <button aria-label={'Subir foto ' + (index + 1)} disabled={index === 0} onClick={() => shift(index, index - 1)}>↑</button>
        <button aria-label={'Bajar foto ' + (index + 1)} disabled={index === film.clips.length - 1} onClick={() => shift(index, index + 1)}>↓</button>
        <button aria-label={'Quitar foto ' + (index + 1)} onClick={() => {
          setFilm({ ...film, clips: film.clips.filter((_, i) => i !== index) });
          setSelected(Math.max(0, Math.min(selected, film.clips.length - 2)));
          setPick(undefined);
          seek(0);
        }}>×</button>
      </li>)}</ol>
      {clip && <div className="film-settings">
        <h2>Foto {selected + 1}</h2>
        {range('Duración en segundos', clip.seconds, 1, 20, 1, seconds => { update({ seconds }); seek(0); })}
        {range('Velocidad inicial', clip.pace, .5, 2, .05, pace => update({ pace }))}
        {inserted && <p>El encuadre de llegada lo determina la posición y el tamaño de esta foto dentro de la anterior.</p>}
        {!inserted && <>{range('Intensidad del zoom', clip.zoom, 1, 4, .05, zoom => update({ zoom }))}
        {range('Punto de enfoque horizontal (%)', clip.x * 100, 0, 100, 1, x => update({ x: x / 100 }))}
        {range('Punto de enfoque vertical (%)', clip.y * 100, 0, 100, 1, y => update({ y: y / 100 }))}</>}
        <label className="film-inset-check"><input type="checkbox" checked={!!clip.inset && selected < film.clips.length - 1}
          disabled={selected >= film.clips.length - 1} onChange={event => update({ inset: event.target.checked ? { x: .06, y: .07, area: .2 } : undefined })}/> Insertar la siguiente foto dentro de esta</label>
        {clip.inset && selected < film.clips.length - 1 && <>
          {range('Área de la foto insertada (%)', clip.inset.area * 100, 2, 60, 1, area => update({ inset: { ...clip.inset!, area: area / 100 } }))}
          {range('Posición horizontal (%)', clip.inset.x * 100, 0, 100, 1, x => update({ inset: { ...clip.inset!, x: x / 100 } }))}
          {range('Posición vertical (%)', clip.inset.y * 100, 0, 100, 1, y => update({ inset: { ...clip.inset!, y: y / 100 } }))}
        </>}
        {source && <><div className="film-actions">
          {!inserted && <button aria-pressed={pick === 'focus'} onClick={() => setPick(pick === 'focus' ? undefined : 'focus')}>Marcar enfoque en la imagen</button>}
          {clip.inset && selected < film.clips.length - 1 && <button aria-pressed={pick === 'inset'} onClick={() => setPick(pick === 'inset' ? undefined : 'inset')}>Colocar foto insertada</button>}
        </div>{pick && <img className="film-target" src={source} alt="Selecciona un punto sobre la fotografía"
          onClick={event => {
            const rect = event.currentTarget.getBoundingClientRect();
            const x = (event.clientX - rect.left) / rect.width, y = (event.clientY - rect.top) / rect.height;
            if (pick === 'focus') update({ x, y });
            else if (clip.inset) update({ inset: { ...clip.inset, x, y } });
            setPick(undefined);
          }}/>}</>}
      </div>}
      <button className="primary" disabled={!ready || loading} onClick={() => void save()}>Guardar recorrido</button>
    </fieldset>}

    {!editing && (done || props.photos.length > 0) && <section className="film-memories">
      <h2>Fotos de la visita</h2>
      {done && <button className="primary" onClick={props.addPhoto}>Añadir foto al final del recorrido</button>}
      {props.photos.map(photo => <div className="film-memory" key={photo.id}>
        <button className="list-row" onClick={() => props.openPhoto(photo)}><PhotoImage imageId={photo.imageId} alt=""/><span>{photo.flowerName || photo.text || 'Fotografía'}<small>{photo.date}</small></span></button>
        <button onClick={() => props.editPhoto(photo)}>Editar foto</button>
      </div>)}
    </section>}
    <button className="screen-back" aria-label="Atrás" disabled={locked} onClick={props.back}>‹</button>
  </section>;
}
