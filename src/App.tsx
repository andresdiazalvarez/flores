import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import WorldMap from './WorldMap';
import FilmView from './FilmView';
import type { Film } from './film';
import PhotoImage from './PhotoImage';
import { loadLibrary, updateLibrary, prepareImage } from './storage';
import { flowerRows, appendPhoto, appendPanorama, dateText, EMPTY, id, normalize, PHOTO_SIZE, pointRows, validDate, WORLD, type Library, type MemoryPoint, type Panorama, type Picture, type PlacedPhoto, type View, type Zone } from './model';
import './style.css';

type Screen = 'home' | 'map' | 'place' | 'date' | 'flower' | 'panorama';
type Frame = { screen: Screen; view: View; panoramaId?: string };
type PointDraft = { coords: [number, number]; view: View; labels: Record<string,string>; existing?: MemoryPoint };
type PhotoDraft = { panoramaId: string; picture: Picture; direction: number; y: number; date: string };
function BlobImage({ blob, alt }: { blob: Blob; alt: string }) {
  const [url,setUrl]=useState('');
  useEffect(()=>{const value=URL.createObjectURL(blob);setUrl(value);return()=>URL.revokeObjectURL(value);},[blob]);
  return <img src={url||undefined} alt={alt}/>;
}
function Modal({title,close,children,locked=false,message}:{title:string;close:()=>void;children:React.ReactNode;locked?:boolean;message?:string}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close();},[]);
  return <dialog ref={ref} className="modal" onCancel={e=>{e.preventDefault();if(!locked)close();}}><header><h2>{title}</h2><button aria-label="Cerrar cuadro" disabled={locked} onClick={close}>×</button></header>{children}{message&&<p className="inline-error" role="alert">{message}</p>}<button type="button" className="modal-back" aria-label="Volver desde el cuadro" disabled={locked} onClick={close}>‹</button></dialog>;
}
function PointForm({draft,busy,save}:{draft:PointDraft;busy:boolean;save:(date:string,name:string)=>void}) {
  const [date,setDate]=useState(draft.existing?.date??'');const [name,setName]=useState(draft.existing?.name??'');
  return <form onSubmit={e=>{e.preventDefault();if(validDate(date))save(date,name.trim());}}><label>Fecha de la visita<input required type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>Nombre del lugar (opcional)<input maxLength={160} value={name} onChange={e=>setName(e.target.value)} placeholder="Playa, paseo, jardín…"/></label><p className="help">La ubicación se guarda automáticamente. {draft.existing?'Mantén pulsado el punto o su fecha para preparar el recorrido.':'Al guardar la fecha, el punto queda marcado y continuarás con la preparación del recorrido.'}</p><button className="primary" disabled={busy||!validDate(date)}>{draft.existing?'Guardar fecha':'Crear punto y continuar'}</button></form>;
}
function FlowerFields({value,name,change,setName}:{value:boolean|null;name:string;change:(v:boolean)=>void;setName:(v:string)=>void}){
 return <><fieldset><legend>¿Es una flor?</legend><button type="button" aria-pressed={value===true} onClick={()=>change(true)}>Sí</button><button type="button" aria-pressed={value===false} onClick={()=>change(false)}>No</button></fieldset>{value&&<label>Nombre de la flor<input required maxLength={120} value={name} onChange={e=>setName(e.target.value)} placeholder="Por ejemplo, orquídea"/></label>}</>;
}
function PhotoForm({draft,busy,save,onError}:{draft:PhotoDraft;busy:boolean;save:(date:string,text:string,isFlower:boolean,flowerName:string)=>void;onError:(message:string)=>void}) {
  const [isFlower,setIsFlower]=useState<boolean|null>(null);const [flowerName,setFlowerName]=useState('');
  const [withText,setWithText]=useState<boolean|null>(null);const [date,setDate]=useState(draft.date);const [text,setText]=useState('');
  return <form onSubmit={e=>{e.preventDefault();if(busy)return;if(withText===null){onError('Elige Sí o No para el texto.');return;}if(isFlower===null){onError('Indica si la foto es una flor.');return;}if(isFlower&&!flowerName.trim()){onError('Escribe el nombre de la flor.');return;}if(validDate(date))save(date,withText?text.trim():'',isFlower,isFlower?flowerName.trim():'');}}><div className="preview-photo"><BlobImage blob={draft.picture.thumbnail} alt="Foto que vas a colocar"/></div><fieldset><legend>¿Quieres añadir un texto?</legend><button type="button" aria-pressed={withText===true} onClick={()=>setWithText(true)}>Sí</button><button type="button" aria-pressed={withText===false} onClick={()=>setWithText(false)}>No</button></fieldset>{withText&&<label>Texto de la foto<input maxLength={300} value={text} onChange={e=>setText(e.target.value)}/></label>}{withText!==null&&<FlowerFields value={isFlower} name={flowerName} change={setIsFlower} setName={setFlowerName}/>}<label>Fecha de la foto<input required type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><button className="primary" disabled={busy||withText===null||isFlower===null||(isFlower&&!flowerName.trim())||!validDate(date)}>Guardar</button></form>;
}
function EditPhoto({photo,busy,save}:{photo:PlacedPhoto;busy:boolean;save:(date:string,text:string,isFlower:boolean,flowerName:string)=>void}) {
  const [date,setDate]=useState(photo.date);const [text,setText]=useState(photo.text);const [isFlower,setIsFlower]=useState(!!photo.isFlower);const [flowerName,setFlowerName]=useState(photo.flowerName||'');
  return <form onSubmit={(e:FormEvent)=>{e.preventDefault();if(validDate(date)&&(!isFlower||flowerName.trim()))save(date,text.trim(),isFlower,isFlower?flowerName.trim():'');}}><p className="help">Puedes cambiar la fecha, el texto y la clasificación.</p><FlowerFields value={isFlower} name={flowerName} change={setIsFlower} setName={setFlowerName}/><label>Fecha de la foto<input required type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>Texto de la foto<input maxLength={300} value={text} onChange={e=>setText(e.target.value)}/></label><button className="primary" disabled={busy}>Guardar cambios</button></form>;
}
export default function App(){
  const [library,setLibrary]=useState<Library>(EMPTY);const libraryRef=useRef(library);
  const [ready,setReady]=useState(false);const [fatal,setFatal]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
  const [screen,setScreen]=useState<Screen>('home');const [mapMounted,setMapMounted]=useState(false);
  const viewRef=useRef<View>(WORLD);const history=useRef<Frame[]>([]);const screenRef=useRef<Screen>('home');screenRef.current=screen;
  const [request,setRequest]=useState({view:WORLD,token:0,arrive:undefined as string|undefined});
  const [panoramaId,setPanoramaId]=useState<string>();const panoramaRef=useRef(panoramaId);panoramaRef.current=panoramaId;
  const [selected,setSelected]=useState<string|null>(null);const [fullPhoto,setFullPhoto]=useState<PlacedPhoto|null>(null);
  const [editing,setEditing]=useState<string|null>(null);const [editPanel,setEditPanel]=useState(false);
  const [pointDraft,setPointDraft]=useState<PointDraft|null>(null);const [zoneDialog,setZoneDialog]=useState(false);const [zoneName,setZoneName]=useState('');const activeZone=useRef<string|undefined>(undefined);const geoLabels=useRef<Record<string,string>>({});
  const [panoramaStep,setPanoramaStep]=useState<string|null>(null);const [filmPoint,setFilmPoint]=useState<string|null>(null);
  const [photoDraft,setPhotoDraft]=useState<PhotoDraft|null>(null);
  const [flowerPlace,setFlowerPlace]=useState('');
  const [query,setQuery]=useState('');const [filterDate,setFilterDate]=useState('');
  const photoInput=useRef<HTMLInputElement>(null);
  const uploadPosition=useRef<{panoramaId:string;direction:number;y:number;date:string}|null>(null);
  const queue=useRef<Promise<void>>(Promise.resolve());
  useEffect(()=>{let alive=true;loadLibrary().then(data=>{if(alive){libraryRef.current=data;setLibrary(data);setReady(true);}}).catch(error=>{if(alive)setFatal(`No se pueden abrir los datos de Flores: ${(error as Error).message}`);});return()=>{alive=false;};},[]);
  const commit=(update:(current:Library)=>Library,pictures:Picture[]=[])=>{
    const operation=queue.current.catch(()=>{}).then(async()=>{const next=await updateLibrary(update,pictures);libraryRef.current=next;setLibrary(next);});queue.current=operation;return operation;
  };
  const run=async(action:()=>Promise<void>)=>{setBusy(true);setMessage('');try{await action();}catch(error){setMessage((error as Error).message);return false;}finally{setBusy(false);}return true;};
  const snapshot=():Frame=>({screen:screenRef.current,view:structuredClone(viewRef.current),panoramaId:panoramaRef.current});
  const go=(next:Screen)=>{history.current.push(snapshot());setScreen(next);};
  const home=()=>{history.current=[];setSelected(null);setFullPhoto(null);setEditing(null);setEditPanel(false);setScreen('home');};
  const restore=(frame:Frame)=>{setFilmPoint(null);setScreen(frame.screen);setPanoramaId(frame.panoramaId);if(frame.screen==='map'){setMapMounted(true);viewRef.current=frame.view;setRequest({view:frame.view,token:Date.now(),arrive:undefined});}};
  const back=()=>{setMessage('');if(fullPhoto){setFullPhoto(null);return;}if(editing){setEditing(null);setEditPanel(false);return;}setSelected(null);const frame=history.current.pop();if(frame)restore(frame);else home();};
  const openMap=()=>{history.current=[{screen:'home',view:WORLD}];viewRef.current=WORLD;setMapMounted(true);setRequest({view:WORLD,token:Date.now(),arrive:undefined});setScreen('map');};
  const openPanorama=(pointId:string)=>{setMessage('');
    const choices=libraryRef.current.panoramas.filter(p=>p.pointId===pointId);if(!choices.length){setSelected(pointId);return;}
    history.current.push({screen:'map',view:structuredClone(viewRef.current)});setFilmPoint(null);setPanoramaId(choices[choices.length-1].id);setSelected(null);setEditing(null);setScreen('panorama');
  };
  const travel=(point:MemoryPoint)=>{history.current.push(snapshot());setSelected(point.id);setMapMounted(true);const view={...point.view,center:point.coords,zoom:Math.max(13,point.view.zoom)};setRequest({view,token:Date.now(),arrive:point.id});setScreen('map');};
  const travelZone=(zone:Zone)=>{history.current.push(snapshot());activeZone.current=zone.id;setSelected(null);setMapMounted(true);setRequest({view:zone.view,token:Date.now(),arrive:undefined});setScreen('map');};
  const startBackgrounds = (pointId: string) => {
    if (!ready || busy) return;
    history.current.push(snapshot());
    setPanoramaStep(null);
    setFilmPoint(pointId);
    setPanoramaId(undefined);
    setScreen('panorama');
  };

  const saveFilm = async (film: Film, pictures: Picture[]) => {
    const backgrounds = film.clips.map(clip => clip.imageId);
    if (panoramaId) {
      await commit(current => ({
        ...current,
        panoramas: current.panoramas.map(p => p.id === panoramaId ? { ...p, backgrounds, film } : p),
      }), pictures);
      return;
    }
    if (!filmPoint) throw new Error('El punto de este recorrido no está disponible.');
    const created: Panorama = { id: id(), pointId: filmPoint, backgrounds, film, direction: 0, created: Date.now() };
    await commit(current => appendPanorama(current, created), pictures);
    setPanoramaId(created.id);
    setFilmPoint(null);
  };
  const startPhoto=()=>{if(!ready||busy||!panoramaId||editing)return;const pano=libraryRef.current.panoramas.find(p=>p.id===panoramaId);const point=libraryRef.current.points.find(p=>p.id===pano?.pointId);if(!point)return;uploadPosition.current={panoramaId,direction:Math.max(0,pano!.backgrounds.length-1)+.5,y:.5,date:point.date};if(photoInput.current){photoInput.current.value='';photoInput.current.click();}};
  const selectedPoint=library.points.find(p=>p.id===selected);
  const panorama=library.panoramas.find(p=>p.id===panoramaId);const point=library.points.find(p=>p.id===(panorama?.pointId ?? filmPoint));const photoEditing=library.photos.find(p=>p.id===editing);
  const available=useMemo(()=>new Set(library.panoramas.map(p=>p.pointId)),[library.panoramas]);
  const flowers=screen==="flower"?flowerRows(library,query,filterDate,flowerPlace):[];
  const rows=pointRows(library,query,filterDate,screen==='date');
  const remember=(view:View)=>{const last=history.current.at(-1);if(!last||last.screen!=='map'||Math.abs(last.view.zoom-view.zoom)>.01||Math.abs(last.view.center[0]-view.center[0])>.00001||Math.abs(last.view.center[1]-view.center[1])>.00001)history.current.push({screen:'map',view});};
  const edited=async(date:string,text:string,isFlower:boolean,flowerName:string)=>{if(!editing)return;await commit(current=>({...current,photos:current.photos.map(p=>p.id===editing?{...p,date,text,isFlower,flowerName}:p)}));setEditing(null);setEditPanel(false);};
  return <main>
    {mapMounted&&<div className={`map-shell ${screen==='map'?'':'offscreen'}`}><WorldMap points={library.points} draftCoords={pointDraft&&!pointDraft.existing?pointDraft.coords:undefined} available={available} visible={screen==='map'} request={request} onView={view=>{viewRef.current=view;}} onLabels={labels=>{geoLabels.current=labels;}} onLocate={()=>setSelected(null)} remember={remember} create={(coords,view,labels)=>{setSelected(null);setPointDraft({coords,view,labels});}} select={openPanorama} upload={startBackgrounds} arrive={pointId=>{if(available.has(pointId))openPanorama(pointId);else setSelected(pointId);}}/>
      {screen==='map'&&<><div className="top-controls"><button className="screen-back" aria-label="Atrás" onClick={back}>‹</button><span>Flores</span><button aria-label="Inicio" onClick={home}>⌂</button></div><button className="save-zone" onClick={()=>{setZoneName('');setZoneDialog(true);}} disabled={!ready}>Guardar esta zona</button><p className="map-hint">Un toque para acercar · Dos para crear un punto</p>{selectedPoint&&<section className="point-notice"><strong>{dateText(selectedPoint.date)} · {selectedPoint.name||'Punto sin nombre'}</strong><p>{available.has(selectedPoint.id)?'Abriendo recorrido…':'Mantén pulsado para preparar el recorrido'}</p>{!available.has(selectedPoint.id)&&<button onClick={()=>startBackgrounds(selectedPoint.id)}>Preparar recorrido</button>}<button onClick={()=>setPointDraft({coords:selectedPoint.coords,view:selectedPoint.view,labels:{},existing:selectedPoint})}>Editar</button><button onClick={()=>setSelected(null)}>Cerrar</button></section>}</>}
    </div>}
    {screen==='home'&&<section className="home"><h1>Flores</h1><nav aria-label="Inicio"><button disabled={!ready} onClick={openMap}><span aria-hidden="true">◎</span>MAPA<b>›</b></button><button disabled={!ready} onClick={()=>{setQuery('');setFilterDate('');go('place');}}><span aria-hidden="true">⌖</span>LUGAR<b>›</b></button><button disabled={!ready} onClick={()=>{setQuery('');setFilterDate('');go('date');}}><span aria-hidden="true">▦</span>FECHA<b>›</b></button><button disabled={!ready} onClick={()=>{setQuery('');setFilterDate('');setFlowerPlace('');go('flower');}}><span aria-hidden="true">❀</span>FLOR<b>›</b></button></nav>{!ready&&!fatal&&<p role="status">Abriendo Flores…</p>}</section>}
    {(screen==='place'||screen==='date')&&<section className="listing"><header><button className="screen-back" aria-label="Atrás" onClick={back}>‹</button><h1>{screen==='place'?'LUGAR':'FECHA'}</h1><button aria-label="Inicio" onClick={home}>⌂</button></header><div className="filters"><label>Buscar lugar<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Nombre del lugar"/></label><label>Fecha<input type="date" value={filterDate} onChange={e=>setFilterDate(e.target.value)}/></label><button onClick={()=>{setQuery('');setFilterDate('');}}>Limpiar</button></div>
      {screen==='place'&&library.zones.filter(z=>normalize(z.name).includes(normalize(query))).length>0&&<><h2>Zonas guardadas</h2>{library.zones.filter(z=>normalize(z.name).includes(normalize(query))).map(zone=><button className="list-row" key={zone.id} onClick={()=>travelZone(zone)}><span><strong>{zone.name}</strong><small>Zona del mapa · Encuadre guardado</small></span><b>›</b></button>)}</>}
      <h2>{screen==='date'?'Fechas y lugares':'Lugares y fechas'}</h2>{rows.map(p=>{const pano=library.panoramas.find(x=>x.pointId===p.id);return <button key={p.id} className="list-row" onClick={()=>travel(p)}>{pano&&<PhotoImage imageId={pano.backgrounds[0]} alt=""/>}<span><strong>{screen==='date'?dateText(p.date):p.name||'Sin nombre'}</strong><span>{screen==='date'?p.name||'Sin nombre':dateText(p.date)}</span><small>{pano?'Ver recorrido':'Recorrido pendiente'}</small></span><b>›</b></button>;})}{!rows.length&&<p className="empty">No hay puntos con estos filtros. En MAPA, pulsa dos veces en una zona vacía para crear una fecha.</p>}
    </section>}
    {screen==='flower'&&<section className="listing"><header><h1>FLOR</h1><button aria-label="Inicio" onClick={home}>⌂</button></header><button className="screen-back" aria-label="Atrás" onClick={back}>‹</button><div className="filters"><label>Buscar flor<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Por ejemplo, orquídea"/></label><label>Lugar<input value={flowerPlace} onChange={e=>setFlowerPlace(e.target.value)}/></label><label>Fecha<input type="date" value={filterDate} onChange={e=>setFilterDate(e.target.value)}/></label><button onClick={()=>{setQuery('');setFlowerPlace('');setFilterDate('');}}>Limpiar</button></div><h2>Flores guardadas</h2>{flowers.map(({photo,panorama,point})=><button className="list-row" key={photo.id} onClick={()=>{history.current.push(snapshot());setFilmPoint(null);setPanoramaId(panorama.id);setEditing(null);setScreen('panorama');setFullPhoto(photo);}}><PhotoImage imageId={photo.imageId} alt=""/><span><strong>{photo.flowerName}</strong><span>{dateText(photo.date)} · {point.name||'Sin nombre'}</span><small>Ver foto y recorrido</small></span><b>›</b></button>)}{!flowers.length&&<p className="empty">No hay flores con estos filtros. Al añadir o editar una foto, indica que es una flor y escribe su nombre.</p>}</section>}
    {screen === 'panorama' && point && <><FilmView
      key={panorama?.id ?? point.id}
      panorama={panorama}
      title={point.name}
      photos={library.photos.filter(photo => photo.panoramaId === panorama?.id)}
      selectedPhoto={fullPhoto?.id}
      save={saveFilm}
      back={back}
      addPhoto={startPhoto}
      openPhoto={setFullPhoto}
      editPhoto={photo => { setEditing(photo.id); setEditPanel(true); }}
    />
      {photoEditing&&editPanel&&<aside className="edit-panel"><header><h2>Editar foto</h2><button aria-label="Cerrar edición para mover la foto" onClick={()=>setEditPanel(false)}>×</button></header><EditPhoto key={photoEditing.id} photo={photoEditing} busy={busy} save={(date,text,isFlower,flowerName)=>void run(()=>edited(date,text,isFlower,flowerName))}/><button onClick={()=>{setEditing(null);setEditPanel(false);}}>Terminar edición</button></aside>}
    </>}
    {fullPhoto&&<section className="full-photo" role="dialog" aria-modal="true" aria-label="Fotografía completa"><button aria-label="Atrás desde foto completa" className="full-back" onClick={back}>‹</button><div className="full-images"><PhotoImage imageId={fullPhoto.imageId} kind="original" alt="Fotografía completa sin recortar"/></div><p>{fullPhoto.isFlower&&<strong>{fullPhoto.flowerName} · </strong>}{dateText(fullPhoto.date)}{fullPhoto.text&&` · ${fullPhoto.text}`}</p></section>}
    {pointDraft&&<Modal message={message} title={pointDraft.existing?'Editar punto':'Crear punto fechado'} locked={busy} close={()=>setPointDraft(null)}><PointForm draft={pointDraft} busy={busy} save={(date,name)=>void run(async()=>{const draft=pointDraft;if(draft.existing)await commit(current=>({...current,points:current.points.map(p=>p.id===draft.existing!.id?{...p,date,name}:p)}));else{const pointId=id();await commit(current=>({...current,points:[...current.points,{id:pointId,coords:draft.coords,date,name,view:draft.view,zoneId:activeZone.current,...draft.labels}]}));setSelected(pointId);setPanoramaStep(pointId);}setPointDraft(null);})}/></Modal>}
    {panoramaStep && <Modal title="Crear recorrido cinematográfico" locked={busy} close={() => setPanoramaStep(null)}>
      <p>La visita está guardada. Puedes preparar el recorrido ahora o volver más tarde desde el marcador.</p>
      <button className="primary" onClick={() => startBackgrounds(panoramaStep)}>Preparar recorrido</button>
      <button onClick={() => setPanoramaStep(null)}>Cargar más tarde</button>
    </Modal>}
    {zoneDialog&&<Modal message={message} title="Guardar esta zona" close={()=>setZoneDialog(false)} locked={busy}><form onSubmit={e=>{e.preventDefault();void run(async()=>{const zone:Zone={id:id(),name:zoneName.trim(),view:structuredClone(viewRef.current),...geoLabels.current};await commit(current=>({...current,zones:[...current.zones,zone]}));activeZone.current=zone.id;setZoneDialog(false);setMessage('Zona guardada. La encontrarás en LUGAR.');});}}><label>Nombre de la zona<input required maxLength={160} value={zoneName} onChange={e=>setZoneName(e.target.value)}/></label><p className="help">Conserva el centro y el acercamiento actuales del mapa real.</p><button className="primary" disabled={busy||!zoneName.trim()}>Guardar zona</button></form></Modal>}
    {photoDraft&&<Modal message={message} title="Añadir foto de la visita" locked={busy} close={()=>setPhotoDraft(null)}><PhotoForm draft={photoDraft} busy={busy} onError={setMessage} save={(date,text,isFlower,flowerName)=>void run(async()=>{const draft=photoDraft;const photo:PlacedPhoto={id:id(),panoramaId:draft.panoramaId,imageId:draft.picture.id,date,text,direction:draft.direction,y:draft.y,size:PHOTO_SIZE,isFlower,flowerName};await commit(current=>appendPhoto(current,photo),[draft.picture]);setPhotoDraft(null);})}/></Modal>}
    <input hidden ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Seleccionar fotografía" onChange={e=>{const file=e.target.files?.[0];const position=uploadPosition.current;if(!file||!position)return;void run(async()=>{const picture=await prepareImage(file);setPhotoDraft({...position,picture});});}}/>
    {busy&&<div className="busy" role="status">Preparando y guardando…</div>}{fatal&&<div className="fatal" role="alert">{fatal}</div>}{message&&<div className="toast" role="status">{message}<button aria-label="Cerrar aviso" onClick={()=>setMessage('')}>×</button></div>}
  </main>;
}
