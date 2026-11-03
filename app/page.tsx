import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGLTF, OrbitControls, Stage } from '@react-three/drei';
import { ArrowLeft } from 'lucide-react'; // Tambahkan ini jika belum ada
import {flushSync} from 'react-dom';
import {registerAtlasTools} from './agent-tools';
import {useEffect,useMemo,useRef,useState,useCallback} from 'react';
import {Activity,ArrowUpRight,ChevronRight,Focus,Info,Layers3,Lock,RotateCcw,RotateCw,Search,X,Settings,EyeOff,MousePointer2,Database,Globe,RefreshCw,Square} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {Slider} from '@/components/ui/slider';
import {Switch} from '@/components/ui/switch';
import {Sheet,SheetContent,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {Combobox,ComboboxInput,ComboboxContent,ComboboxList,ComboboxItem,ComboboxEmpty} from '@/components/ui/combobox';
import AnatomyScene from './scene';
import DataManager, {type MedicalDb} from './components/DataManager';
import AdminAuthModal, {isAdminLoggedIn, adminLogout, ChangePasswordForm} from './components/AdminAuth';
import GeminiSettings from './components/GeminiSettings';
import {DEFAULT_VISIBLE,SYSTEMS,EXPLANATIONS,explanation,type Atlas,type Concept,type SceneState,type SystemId,type View} from './anatomy';
import AnatomyChatbot from '@/components/ui/AnatomyChatbot';
import {fetchDb, saveDb, invalidateCache} from './lib/dbService';

const initial:SceneState={explode:0,visible:DEFAULT_VISIBLE,selected:[],hidden:[],isolate:false,view:'three-quarter',rotate:false,reset:0};

function ExternalLung() {
  const { scene } = useGLTF('/3d-anatomy/models/lung.glb'); 
  return <primitive object={scene} />;
}

// Helper untuk mengunggah dan menyinkronkan ikon tab peramban (favicon) di server & DOM
async function uploadAndApplyFavicon(base64Image: string) {
  if (typeof document === 'undefined') return;

  const t = Date.now();
  if (base64Image && base64Image.trim()) {
    try {
      localStorage.setItem('customFaviconTimestamp', String(t));
      await fetch('/api/save-favicon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64: base64Image.trim() }),
      }).catch(() => {
        return fetch('/3d-anatomy/db.php?action=save_favicon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64: base64Image.trim() }),
        });
      });
    } catch(e) {}
  } else {
    try {
      localStorage.removeItem('customFaviconTimestamp');
      await fetch('/api/reset-favicon', { method: 'POST' }).catch(() => {});
    } catch(e) {}
  }

  // Update elemen DOM link dengan URL server bertimestamp agar Safari memuat file gambar asli
  const timestamp = localStorage.getItem('customFaviconTimestamp') || t;
  const baseUrl = ((import.meta as any).env?.BASE_URL || '/');
  const serverFaviconUrl = `${baseUrl}custom-favicon.png?t=${timestamp}`;
  const finalHref = base64Image && base64Image.trim() ? serverFaviconUrl : `${baseUrl}favicon.png`;

  const oldIcons = document.querySelectorAll<HTMLLinkElement>("link[rel*='icon']");
  oldIcons.forEach((el) => el.remove());

  const addLink = (rel: string) => {
    const link = document.createElement('link');
    link.rel = rel;
    link.type = 'image/png';
    link.href = finalHref;
    document.head.appendChild(link);
  };

  addLink('icon');
  addLink('shortcut icon');
  addLink('apple-touch-icon');
}

export default function Home(){
 const detailTitle=useRef<HTMLHeadingElement>(null);
 const [atlas,setAtlas]=useState<Atlas|null>(null),[state,setState]=useState(initial),[progress,setProgress]=useState(0),[error,setError]=useState('');
 const [panel,setPanel]=useState<'layers'|'search'|'settings'|'database'|'about'|null>(null);
 const [details,setDetails]=useState(false),[query,setQuery]=useState(''),[chosen,setChosen]=useState<Concept|null>(null);
 
 const [appName, setAppName] = useState(() => {
   if (typeof window !== 'undefined') return localStorage.getItem('customAppName') || '3D Anatomy Lab.RM';
   return '3D Anatomy Lab.RM';
 });

 const [appSubtitle, setAppSubtitle] = useState(() => {
   if (typeof window !== 'undefined') return localStorage.getItem('customAppSubtitle') ?? 'LAB RM Fakultas Kesehatan · UDINUS';
   return 'LAB RM Fakultas Kesehatan · UDINUS';
 });

 const [appEyebrow, setAppEyebrow] = useState(() => {
   if (typeof window !== 'undefined') return localStorage.getItem('customAppEyebrow') ?? 'INTERACTIVE ANATOMY';
   return 'INTERACTIVE ANATOMY';
 });
 
 const [appLogo, setAppLogo] = useState(() => {
   if (typeof window !== 'undefined') return localStorage.getItem('customAppLogo') || '';
   return '';
 });

 const [appFavicon, setAppFavicon] = useState(() => {
   if (typeof window !== 'undefined') return localStorage.getItem('customAppFavicon') || '';
   return '';
 });

 const [syncFaviconWithLogo, setSyncFaviconWithLogo] = useState(() => {
   if (typeof window !== 'undefined') {
     const saved = localStorage.getItem('customSyncFaviconWithLogo');
     return saved === null ? true : saved === 'true';
   }
   return true;
 });

 const effectiveFavicon = (syncFaviconWithLogo ? appLogo : appFavicon) || appLogo || appFavicon;

 // Sinkronisasi Judul Tab Peramban
 useEffect(() => {
   if (typeof document !== 'undefined') {
     document.title = appName || '3D Anatomy Lab.RM';
   }
 }, [appName]);

 // Sinkronisasi Favicon / Ikon Tab Peramban
 useEffect(() => {
   uploadAndApplyFavicon(effectiveFavicon);
 }, [effectiveFavicon]);

 // Database: selalu fetch dari server (bukan localStorage)
 const [medicalDb, setMedicalDb] = useState<MedicalDb>({});
 const [dbLoading, setDbLoading] = useState(true);

 // Load database dari server saat pertama kali
 useEffect(() => {
   setDbLoading(true);
   fetchDb()
     .then(db => { setMedicalDb(db); })
     .catch(err => console.error('[DB] Gagal memuat database:', err))
     .finally(() => setDbLoading(false));
 }, []);

 // handleDbChange: simpan ke state React + trigger save ke server oleh DataManager
 const handleDbChange = useCallback((newDb: MedicalDb) => {
   setMedicalDb(newDb);
   invalidateCache(); // Paksa fetch ulang saat berikutnya
 }, []);

 const [multiSelect, setMultiSelect] = useState(false);
 const [hideHistory, setHideHistory] = useState<string[][]>([]);
 const [redoHistory, setRedoHistory] = useState<string[][]>([]);
 const [showAdminLogin, setShowAdminLogin] = useState(false);

 useEffect(()=>{
  const abort=new AbortController();
  setProgress(0);setError('');setAtlas(null);setChosen(null);setDetails(false);setState({...initial,visible:DEFAULT_VISIBLE});
  
  // URL DIKUNCI MATI KE SUBFOLDER:
  fetch('/3d-anatomy/models/atlas.json', {signal:abort.signal})
    .then(r=>{if(!r.ok)throw new Error('The anatomy catalogue could not be loaded.');return r.json();})
    .then(data=>setAtlas(data as Atlas))
    .catch(e=>{if(e.name!=='AbortError')setError(e.message);});
  
   return()=>abort.abort();
 },[]);

 useEffect(() => {
   const key = (e: KeyboardEvent) => {
     if (e.key === '/' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
       e.preventDefault();
       setPanel('search');
       setDetails(false);
     }
     if (e.key === 'Escape') {
       setPanel(null);
       if (document.activeElement instanceof HTMLElement) { document.activeElement.blur(); }
     }
   };
   window.addEventListener('keydown', key);
   const handleOpenSettings = () => {
     setDetails(false);
     setPanel('settings');
   };
   window.addEventListener('open-settings-panel', handleOpenSettings);

   return () => {
     window.removeEventListener('keydown', key);
     window.removeEventListener('open-settings-panel', handleOpenSettings);
   };
 }, []);

 const parts=useMemo(()=>new Map(atlas?.parts.map(p=>[p.id,p])),[atlas]);
 const counts=useMemo(()=>Object.fromEntries(SYSTEMS.map(s=>[s.id,atlas?.parts.filter(p=>p.system===s.id).length??0])),[atlas]);
 const activeSystems=SYSTEMS.filter(s=>counts[s.id]>0);
 const selectedParts=state.selected.map(id=>parts.get(id)).filter(p=>!!p),selected=selectedParts[0],system=SYSTEMS.find(s=>s.id===selected?.system);
 const visibleCount=atlas?.parts.filter(p=>{if(state.hidden?.includes(p.id)) return false; return state.isolate?state.selected.includes(p.id):state.visible.includes(p.system)||state.selected.includes(p.id)}).length??0;
 const results=useMemo(()=>{if(!atlas)return[];const term=query.toLowerCase().trim();if(!term)return ['heart','brain','liver','stomach','spleen','pancreas','urinary bladder','trachea'].map(name=>atlas.concepts.find(c=>c.name.toLowerCase()===name)).filter((x):x is Concept=>!!x);return atlas.concepts.filter(c=>c.name.toLowerCase().includes(term)||c.id.toLowerCase().includes(term)).sort((a,b)=>a.name.length-b.name.length).slice(0,80);},[atlas,query]);
 const choose=(c:Concept)=>{setChosen(c);setState(s=>({...s,selected:c.elements,isolate:false,rotate:false}));setDetails(true);setPanel(null);};
 useEffect(()=>{if(!atlas)return;return registerAtlasTools(atlas,c=>flushSync(()=>choose(c)));},[atlas]);
 
 const choosePart=(id:string)=>{
  const p=parts.get(id);if(!p)return;
  setChosen({id:p.conceptId,name:p.name,elements:[id]});
  setState(s=>{
    let nextSelected = [id];
    if (multiSelect) { nextSelected = s.selected.includes(id) ? s.selected.filter(x => x !== id) : [...s.selected, id]; }
    return {...s,selected:nextSelected,isolate:false,rotate:false};
  });
  setDetails(true);setPanel(null);
 };

 const hideSelected = () => {
   if (state.selected.length === 0) return;
   setHideHistory(prev => [...prev, state.selected]);
   setRedoHistory([]); 
   setState(s => ({...s, hidden: [...(s.hidden || []), ...s.selected], selected: [], isolate: false}));
   setDetails(false);
 };
 
 const undoHide = () => {
   if (hideHistory.length === 0) return;
   const history = [...hideHistory];
   const lastHidden = history.pop()!;
   setHideHistory(history);
   setRedoHistory(prev => [...prev, lastHidden]); 
   setState(s => ({...s, hidden: (s.hidden || []).filter(id => !lastHidden.includes(id))}));
 };

 const redoHide = () => {
   if (redoHistory.length === 0) return;
   const rHistory = [...redoHistory];
   const lastUndone = rHistory.pop()!;
   setRedoHistory(rHistory);
   setHideHistory(prev => [...prev, lastUndone]); 
   setState(s => ({...s, hidden: [...(s.hidden || []), ...lastUndone]}));
 };

 const toggle=(id:SystemId)=>{setDetails(false);setState(s=>({...s,selected:[],isolate:false,visible:s.visible.includes(id)?s.visible.filter(x=>x!==id):[...s.visible,id]}));};
 
 const reset=()=>{
   setState(s=>({...initial,visible:DEFAULT_VISIBLE,reset:s.reset+1,hidden:[]}));
   setHideHistory([]); setRedoHistory([]); setChosen(null); setDetails(false); setPanel(null);
 };
 
 const openPanel=(next:'layers'|'search'|'settings'|'database'|'about')=>{
   setDetails(false);
   if (next === 'database') {
     // Jika sudah login atau panel sedang terbuka → toggle
     if (panel === 'database') { setPanel(null); return; }
     if (isAdminLoggedIn()) { setPanel('database'); }
     else { setShowAdminLogin(true); }
     return;
   }
   setPanel(p=>p===next?null:next);
 };

 const mapped = chosen ? medicalDb[chosen.id] : null;
 
 // Filter anti-error dan penyiapan 3 bahasa
 let nameIndo = mapped?.indonesianName;
 if (nameIndo === "Error Translasi" || nameIndo === "Error/Kosong" || !nameIndo) {
   nameIndo = chosen?.name; // Kembali ke bahasa Inggris jika error
 }
 const displayName = nameIndo; // Diperlukan agar tidak error di bagian caption
 const nameEng = chosen?.name;
 const nameLatin = mapped?.latinName || '';

 const description = mapped?.description || (chosen&&selected?explanation(chosen.name,selected.system):'');
 const snomed = mapped?.snomedCode;
 
 return <main className="studio ios-theme">
  {/* Admin Login Modal */}
  {showAdminLogin && (
    <AdminAuthModal
      onSuccess={() => { setShowAdminLogin(false); setPanel('database'); }}
      onClose={() => setShowAdminLogin(false)}
    />
  )}
  {panel === 'database' && atlas && <DataManager atlas={atlas} db={medicalDb} onDbChange={handleDbChange} onClose={() => setPanel(null)}/>}
  {atlas&&<AnatomyScene atlas={atlas} state={{...state,inspectorOpen:details&&selectedParts.length>0}} onSelect={choosePart} onProgress={n=>{setProgress(n);if(n===100)setError('');}} onError={setError} csvMapping={medicalDb}/>}
  <div className="vignette"/>
  <header className="identity">
    {appEyebrow && <div className="eyebrow"><span className="status-dot"/> {appEyebrow}</div>}
    <h1>
      {appLogo && <img src={appLogo} alt="Logo" style={{height: '38px', width: 'auto', borderRadius: '8px', objectFit: 'contain'}} />}
      {appName}
      <Badge variant="outline" className="edition">3D</Badge>
    </h1>
    {appSubtitle && <div className="identity-meta">{appSubtitle}</div>}
  </header>
  
  <section className={`layers-panel glass ios-glass ${panel === 'layers' ? '!fixed !inset-0 !z-[60] !w-full !max-w-full !h-[100dvh] !rounded-none !flex flex-col p-5' : '!hidden md:!flex'}`} aria-label="Anatomical layers">
   <div className="panel-heading"><span>Systems</span><Button variant="ghost" className="mobile-only icon-button" onClick={()=>setPanel(null)} aria-label="Close systems"><X size={18}/></Button><Badge variant="secondary" className="desktop-only small-number">{activeSystems.length}</Badge></div>
   <div className="layer-presets"><Button variant="ghost" aria-pressed={activeSystems.every(x=>state.visible.includes(x.id))} onClick={()=>setState(s=>({...s,selected:[],isolate:false,visible:activeSystems.map(x=>x.id)}))}>All</Button><Button variant="ghost" aria-pressed={state.visible.length===1&&state.visible[0]==='skeletal'} onClick={()=>setState(s=>({...s,selected:[],isolate:false,visible:['skeletal']}))}>Skeleton</Button><Button variant="ghost" aria-pressed={state.visible.length===6&&['cardiac','respiratory','digestive','urinary','endocrine','reproductive'].every(id=>state.visible.includes(id as SystemId))} onClick={()=>setState(s=>({...s,selected:[],isolate:false,visible:['cardiac','respiratory','digestive','urinary','endocrine','reproductive']}))}>Organs</Button></div>
   <div className="system-list">{activeSystems.map(s=><div className={`system-row ${state.visible.includes(s.id)?'enabled':''}`} key={s.id}><Button variant="ghost" className="system-name" title={`Show only ${s.name.toLowerCase()}`} onClick={()=>setState(v=>({...v,visible:[s.id],isolate:false,selected:[]}))}><span className="system-dot" style={{background:s.color}}/>{s.name}<span className="system-count">{counts[s.id]}</span></Button><Switch checked={state.visible.includes(s.id)} onCheckedChange={()=>toggle(s.id)} aria-label={`Show ${s.name.toLowerCase()}`} /></div>)}</div>
   <div className="panel-foot">
      <span>{visibleCount.toLocaleString()} pieces visible</span>
      <div style={{display:'flex', gap:'5px'}}>
        <Button variant="ghost" onClick={undoHide} disabled={hideHistory.length===0} title="Undo Hide"><RotateCcw size={14}/></Button>
        <Button variant="ghost" onClick={redoHide} disabled={redoHistory.length===0} title="Redo Hide"><RotateCw size={14}/></Button>
        <Button variant="ghost" onClick={()=>setState(s=>({...s,visible:[],selected:[],isolate:false}))}>Hide all</Button>
      </div>
   </div>
  </section>
  {panel==='search'&&<section className="search-panel glass ios-glass" aria-label="Find anatomy"><div className="panel-heading"><span>Find a structure</span><Button variant="ghost" className="icon-button" onClick={()=>setPanel(null)} aria-label="Close search"><X size={18}/></Button></div><Combobox<Concept> items={results} value={null} onValueChange={value=>{if(value)choose(value);}} inputValue={query} onInputValueChange={setQuery} itemToStringLabel={c=>c.name} filter={null} open onOpenChange={open=>{if(!open)setPanel(null);}}><ComboboxInput autoFocus placeholder="Heart, femur, cranial nerve…" aria-label="Search named anatomical structures" showTrigger={false}/><ComboboxContent className="anatomy-search-results ios-glass"><ComboboxEmpty>No structures match your search.</ComboboxEmpty><ComboboxList>{(c:Concept)=>{
    const cm = medicalDb[c.id];
    return <ComboboxItem key={c.id} value={c}><span className="search-result-name">{cm?.indonesianName || c.name}</span><span className="small-number">{c.elements.length} {c.elements.length===1?'piece':'pieces'}</span></ComboboxItem>
  }}</ComboboxList></ComboboxContent></Combobox><p className="search-note">{query?'Showing up to 80 matches. Refine your search to find smaller structures.':'Start with a major organ, or search every named structure.'}</p></section>}
  <nav className="view-controls glass ios-glass" aria-label="Camera controls">
    {(['three-quarter','front','side','back'] as View[]).map((v,i)=><Button variant="ghost" key={v} className={state.view===v?'active':''} aria-pressed={state.view===v} onClick={()=>setState(s=>({...s,view:v,reset:s.reset+1,rotate:false}))} title={`${v} view`} aria-label={`${v} view`}><span>{['¾','F','S','B'][i]}</span></Button>)}
    <i/>
    <Button variant="ghost" aria-label={state.rotate?'Stop rotation':'Rotate body'} title="Auto rotate" className={state.rotate?'active':''} onClick={()=>setState(s=>({...s,rotate:!s.rotate}))}>
      {state.rotate ? <Square size={14} fill="currentColor"/> : <RefreshCw size={17}/>}
    </Button>
  </nav>
  <div className="scene-caption"><span className="caption-line"/><span>{state.isolate?(displayName):'ADULT HUMAN · MALE'}</span><span className="caption-line"/></div>
  
 <div className="bottom-dock glass ios-glass flex items-center justify-start md:justify-center gap-2 px-4 py-3 w-[100vw] md:w-auto max-w-full md:max-w-[90vw] overflow-x-auto overflow-y-hidden no-scrollbar shadow-lg">
    <Button variant="ghost" className={`dock-button !shrink-0 flex flex-col items-center gap-1 h-auto py-2 px-3 ${panel==='layers'?'active':''}`} onClick={()=>openPanel('layers')}>
      <Layers3 size={22}/><span className="text-[10px] leading-none">Systems</span>
    </Button>
    <Button variant="ghost" className={`dock-button !shrink-0 flex flex-col items-center gap-1 h-auto py-2 px-3 ${panel==='search'?'active':''}`} onClick={()=>openPanel('search')}>
      <Search size={22}/><span className="text-[10px] leading-none">Search</span>
    </Button>
    <Button variant="ghost" className={`dock-button !shrink-0 flex flex-col items-center gap-1 h-auto py-2 px-3 ${multiSelect?'active':''}`} onClick={()=>setMultiSelect(!multiSelect)}>
      <MousePointer2 size={22}/><span className="text-[10px] leading-none">Multi-Select</span>
    </Button>
    <Button variant="ghost" className={`dock-button !shrink-0 flex flex-col items-center gap-1 h-auto py-2 px-3 ${panel==='settings'?'active':''}`} onClick={()=>openPanel('settings')}>
      <Settings size={22}/><span className="text-[10px] leading-none">Settings</span>
    </Button>
    <Button variant="ghost" className={`dock-button !shrink-0 flex flex-col items-center gap-1 h-auto py-2 px-3 relative ${panel==='database'?'active':''}`} onClick={()=>openPanel('database')}>
      <Database size={22}/><span className="text-[10px] leading-none">Database</span>
      {!isAdminLoggedIn() && <span className="admin-lock-badge"><Lock size={8}/></span>}
    </Button>
    <Button variant="ghost" className={`dock-button !shrink-0 flex flex-col items-center gap-1 h-auto py-2 px-3 ${panel==='about'?'active':''}`} onClick={()=>openPanel('about')}>
      <Info size={22}/><span className="text-[10px] leading-none">Guides</span>
    </Button>
    <Button variant="ghost" className="dock-button !shrink-0 flex flex-col items-center gap-1 h-auto py-2 px-3" onClick={reset}>
      <RotateCcw size={22}/><span className="text-[10px] leading-none">Reset</span>
    </Button>
  </div>
  
  {progress<100&&!error&&<div className="loading glass ios-glass" role="status"><Activity size={18}/><div><strong>Preparing the anatomy</strong><span>{progress}% · Loading {atlas?.parts.length.toLocaleString()??'2,234'} pieces</span><div className="loading-track"><i style={{width:`${progress}%`}}/></div></div></div>}
  {error&&<div className="loading glass ios-glass error" role="alert"><p>{error}</p><Button variant="ghost" onClick={()=>location.reload()}>Reload viewer</Button></div>}
  
  <Sheet open={details&&selectedParts.length>0} modal={false} disablePointerDismissal onOpenChange={setDetails}><SheetContent initialFocus={detailTitle} className={`detail-sheet glass ios-glass ${state.isolate?'is-isolated':''}`} showCloseButton={true}><div className="detail-header"><div className="detail-accent" style={{background:system?.color}}/><div className="eyebrow">{system?.name??'ANATOMY'}</div>
  
  {/* BLOK DESAIN 3 BAHASA (UPDATE: Inggris -> Indo -> Latin) */}
  <SheetTitle ref={detailTitle} tabIndex={-1} className="structure-title">
    {state.selected.length > 1 ? (
      `${state.selected.length} Bagian Terpilih`
    ) : (
      <div className="flex flex-col gap-1">
        {/* Judul Utama (Inggris) */}
        <span className="text-2xl font-bold text-gray-900 leading-tight">
          {nameEng}
        </span>
        {/* Sub-judul (Indonesia & Latin) */}
        <div className="flex flex-col gap-0 text-sm font-normal mt-1">
          <span className="text-gray-600">🇮🇩 {nameIndo}</span>
          {nameLatin && (
            <span className="text-gray-500 italic">🔬 {nameLatin}</span>
          )}
        </div>
      </div>
    )}
  </SheetTitle>
  {/* AKHIR BLOK DESAIN 3 BAHASA */}
  
  </div><div className="detail-scroll" key={`${chosen?.id}-${state.isolate}`}>
  
  {snomed && state.selected.length === 1 && <div className="snomed-badge">SNOMED CT: {snomed}</div>}
  
  <SheetDescription className="structure-description">{state.selected.length > 1 ? 'Multiple parts selected. You can isolate or hide them together.' : description}</SheetDescription>{chosen&&!EXPLANATIONS[chosen.name.toLowerCase()]&&!mapped&&state.selected.length===1&&<span className="context-note">System overview · structure identified from source anatomy</span>}<div className="structure-meta"><span>Atlas reference<strong>{state.selected.length === 1 ? chosen?.id : 'Multiple'}</strong></span><span>Selected pieces<strong>{state.selected.length.toLocaleString()}</strong></span></div>{selectedParts.length>1&&<div className="member-list"><h3>Included structures</h3>{selectedParts.slice(0,50).map(p=><Button variant="ghost" key={p.id} onClick={()=>choosePart(p.id)}><span>{medicalDb[p.conceptId]?.indonesianName || p.name}</span><ChevronRight size={14}/></Button>)}{selectedParts.length>50&&<p>And {selectedParts.length-50} more modeled pieces.</p>}</div>}<a className="source-link" href="https://lifesciencedb.jp/bp3d/" target="_blank" rel="noreferrer">View anatomical source <ArrowUpRight size={14}/></a></div>
  <div className="detail-actions">
    <Button className={`primary-action ${state.isolate?'active':''}`} onClick={()=>setState(s=>({...s,isolate:!s.isolate,explode:0}))}><Focus size={18}/>{state.isolate?'Show surrounding anatomy':(state.selected.length > 1 ? 'Isolate Selected' : 'Isolate structure')}<ChevronRight size={16}/></Button>
    <div style={{display:'flex', gap:'8px', marginTop: '8px'}}>
      <Button variant="outline" style={{flex: 1, borderColor: '#a8574a', color: '#a8574a'}} onClick={hideSelected}><EyeOff size={16} style={{marginRight:'6px'}}/> Hide</Button>
      <Button variant="ghost" className="secondary-action" style={{flex: 1}} onClick={()=>{setState(s=>({...s,selected:[],isolate:false}));setDetails(false);}}>Clear</Button>
    </div>
  </div></SheetContent></Sheet>
  
  {panel === 'settings' && (
    <section className="fixed inset-0 md:inset-auto md:top-4 md:right-4 md:bottom-4 w-full md:w-[450px] bg-white/95 backdrop-blur-2xl md:border md:border-gray-200/50 rounded-none md:rounded-3xl shadow-2xl flex flex-col z-[60] overflow-hidden p-5 md:p-6">
      <div className="flex justify-between items-center mb-6 shrink-0">
        <h2 className="text-xl font-semibold text-gray-900 tracking-tight">Settings</h2>
        <Button variant="ghost" className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors" onClick={()=>setPanel(null)}><X size={16} /></Button>
      </div>
      <div className="flex-1 overflow-y-auto pr-2">
        {/* Identitas Aplikasi */}
        <div className="space-y-4 mb-5">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Identitas & Tampilan Aplikasi</h3>
          
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Nama Aplikasi (Judul & Tab Browser)</label>
            <input
              type="text"
              value={appName}
              onChange={(e) => {
                setAppName(e.target.value);
                localStorage.setItem('customAppName', e.target.value);
              }}
              placeholder="Contoh: 3D Anatomy Lab.RM"
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
            <p className="text-[10px] text-gray-400 mt-1">Akan tampil di header kiri atas dan sebagai nama tab peramban.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Sub-judul / Nama Institusi</label>
            <input
              type="text"
              value={appSubtitle}
              onChange={(e) => {
                setAppSubtitle(e.target.value);
                localStorage.setItem('customAppSubtitle', e.target.value);
              }}
              placeholder="Contoh: LAB RM Fakultas Kesehatan · UDINUS"
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
            <p className="text-[10px] text-gray-400 mt-1">Teks keterangan institusi di bawah judul utama.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Label Kategori / Tagline Atas</label>
            <input
              type="text"
              value={appEyebrow}
              onChange={(e) => {
                setAppEyebrow(e.target.value);
                localStorage.setItem('customAppEyebrow', e.target.value);
              }}
              placeholder="Contoh: INTERACTIVE ANATOMY"
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
            <p className="text-[10px] text-gray-400 mt-1">Teks kecil dengan titik biru di atas judul utama.</p>
          </div>

          {/* Logo Header Aplikasi */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Logo Header Aplikasi</label>
            <div className="flex items-center gap-3">
              {appLogo ? (
                <div className="relative shrink-0">
                  <img src={appLogo} alt="Logo Header" className="h-12 w-auto max-w-[100px] object-contain bg-white rounded-xl border border-gray-200 p-1.5 shadow-sm" />
                  <button
                    onClick={() => {
                      setAppLogo('');
                      localStorage.removeItem('customAppLogo');
                    }}
                    className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 shadow-sm transition-colors"
                    title="Hapus Logo Header"
                  >
                    <X size={10} strokeWidth={3} />
                  </button>
                </div>
              ) : (
                <div className="h-12 w-12 rounded-xl border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-gray-400 text-[10px] shrink-0">
                  Kosong
                </div>
              )}
              <input
                type="file"
                accept="image/png, image/jpeg, image/svg+xml, image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (file.size > 2 * 1024 * 1024) {
                      alert('Ukuran gambar terlalu besar! Maksimal 2MB.');
                      e.target.value = '';
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                      const base64 = evt.target?.result as string;
                      setAppLogo(base64);
                      localStorage.setItem('customAppLogo', base64);
                    };
                    reader.readAsDataURL(file);
                  }
                }}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-500 file:mr-4 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-all cursor-pointer"
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-1">Logo yang muncul di samping judul pada sudut kiri atas aplikasi.</p>
          </div>

          {/* Logo Tab Browser (Favicon) */}
          <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs font-semibold text-gray-800">Ikon Tab Browser (Favicon)</label>
                <p className="text-[10px] text-gray-500">Ikon yang tampil di tab peramban Anda.</p>
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-medium text-gray-600 select-none">
                <input
                  type="checkbox"
                  checked={syncFaviconWithLogo}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setSyncFaviconWithLogo(checked);
                    localStorage.setItem('customSyncFaviconWithLogo', String(checked));
                  }}
                  className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                />
                Samakan dgn Logo Header
              </label>
            </div>

            {/* Mockup Preview Tab Peramban */}
            <div className="bg-white border border-gray-200 rounded-xl p-2.5 shadow-xs">
              <span className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold block mb-1.5">Preview Tampilan Tab:</span>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100/90 border border-gray-300/70 rounded-t-lg max-w-full text-xs text-gray-800 font-medium shadow-2xs">
                {effectiveFavicon ? (
                  <img src={effectiveFavicon} alt="Favicon Preview" className="h-4 w-4 object-contain rounded-xs shrink-0" />
                ) : (
                  <img src={`${((import.meta as any).env?.BASE_URL || '/')}favicon.png`} alt="Default Favicon" className="h-4 w-4 object-contain rounded-xs shrink-0" />
                )}
                <span className="truncate max-w-[170px] text-[11px] font-medium">{appName || '3D Anatomy Lab.RM'}</span>
                <span className="text-gray-400 hover:text-gray-600 text-[10px] ml-1.5 cursor-default">×</span>
              </div>
            </div>

            {/* Input kustom favicon jika tidak disamakan dengan logo header */}
            {!syncFaviconWithLogo ? (
              <div>
                <div className="flex items-center gap-3">
                  {appFavicon ? (
                    <div className="relative shrink-0">
                      <img src={appFavicon} alt="Favicon" className="h-10 w-10 object-contain bg-white rounded-lg border border-gray-200 p-1 shadow-sm" />
                      <button
                        onClick={() => {
                          setAppFavicon('');
                          localStorage.removeItem('customAppFavicon');
                        }}
                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 shadow-sm transition-colors"
                        title="Hapus Favicon Khusus"
                      >
                        <X size={10} strokeWidth={3} />
                      </button>
                    </div>
                  ) : null}
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/svg+xml, image/x-icon, image/ico, image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (file.size > 1 * 1024 * 1024) {
                          alert('Ukuran ikon tab maksimal 1MB.');
                          e.target.value = '';
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = (evt) => {
                          const base64 = evt.target?.result as string;
                          setAppFavicon(base64);
                          localStorage.setItem('customAppFavicon', base64);
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-500 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-all cursor-pointer"
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Upload gambar ikon khusus berformat PNG/ICO/SVG untuk tab peramban.</p>
              </div>
            ) : (
              <p className="text-[11px] text-gray-500 italic">
                {appLogo ? '✓ Tab browser saat ini otomatis menggunakan logo header yang telah Anda unggah.' : 'Belum ada logo header. Tab browser menggunakan ikon bawaan. Silakan unggah logo header di atas atau uncheck opsi ini untuk mengunggah ikon tab terpisah.'}
              </p>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-100 my-4"/>

        {/* Konfigurasi AI Gemini (Tanya Maki) */}
        <GeminiSettings />

        {/* Divider */}
        <div className="border-t border-gray-100 my-4"/>

        {/* Admin Password Section */}
        <ChangePasswordForm />

        {/* Admin Logout */}
        {isAdminLoggedIn() && (
          <div className="mt-3">
            <button
              onClick={() => { adminLogout(); setPanel(null); }}
              className="w-full py-2 text-xs text-red-500 border border-red-200 rounded-xl hover:bg-red-50 transition-colors font-medium"
            >
              Logout dari sesi Admin
            </button>
          </div>
        )}
      </div>
    </section>
  )}
  
  {panel === 'about' && (
    <section className="fixed inset-0 md:inset-auto md:top-4 md:right-4 md:bottom-4 w-full md:w-[450px] bg-white/95 backdrop-blur-2xl md:border md:border-gray-200/50 rounded-none md:rounded-3xl shadow-2xl flex flex-col z-[60] overflow-hidden p-5 md:p-6">
      <div className="flex justify-between items-center mb-6 shrink-0">
        <h2 className="text-xl font-semibold text-gray-900 tracking-tight">Guides & About</h2>
        <Button variant="ghost" className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors" onClick={()=>setPanel(null)}><X size={16} /></Button>
      </div>
      <div className="flex-1 overflow-y-auto pr-2 space-y-4">
        <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100">
          <strong className="text-blue-600 flex items-center gap-2 mb-3 text-sm"><MousePointer2 size={16}/> Mouse / Trackpad</strong>
          <ul className="text-gray-600 text-sm space-y-2 ml-1">
            <li><strong className="text-gray-900 font-medium">Klik Kiri & Geser:</strong> Memutar kamera (Orbit)</li>
            <li><strong className="text-gray-900 font-medium">Klik Kanan & Geser:</strong> Menggeser posisi (Pan)</li>
            <li><strong className="text-gray-900 font-medium">Scroll/Pinch:</strong> Memperbesar/memperkecil (Zoom)</li>
            <li><strong className="text-gray-900 font-medium">Klik Organ:</strong> Melihat detail di Inspektur</li>
          </ul>
        </div>
        <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100">
          <strong className="text-blue-600 flex items-center gap-2 mb-3 text-sm"><Globe size={16}/> Keyboard</strong>
          <ul className="text-gray-600 text-sm space-y-2 ml-1">
            <li><strong className="text-gray-900 font-medium">Panah Atas/Bawah:</strong> Geser kamera Vertikal</li>
            <li><strong className="text-gray-900 font-medium">Panah Kiri/Kanan:</strong> Geser kamera Horizontal</li>
            <li><strong className="text-gray-900 font-medium">Garis Miring (/):</strong> Buka bilah pencarian</li>
          </ul>
        </div>
        <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100">
          <strong className="text-blue-600 flex items-center gap-2 mb-3 text-sm"><Focus size={16}/> Fitur Pintar</strong>
          <ul className="text-gray-600 text-sm space-y-2 ml-1">
            <li><strong className="text-gray-900 font-medium">Multi-Select:</strong> Aktifkan di menu bawah untuk menyeleksi banyak tulang sekaligus.</li>
            <li><strong className="text-gray-900 font-medium">Hide:</strong> Gunakan di dalam Inspektur untuk menyembunyikan organ yang menutupi bagian dalam.</li>
            <li><strong className="text-gray-900 font-medium">Auto-Rotate:</strong> Tombol putar di kontrol sisi kanan untuk animasi putar otomatis.</li>
          </ul>
        </div>
        
        {/* LISENSI DAN KREDIT DITAMBAHKAN DI SINI */}
        <div className="mt-8 pt-6 border-t border-gray-100 text-[11px] text-gray-500 leading-relaxed space-y-3">
          <p>
            <strong className="text-gray-700">Dimodifikasi & Dikembangkan oleh:</strong><br />
            Maki (Mapping SNOMED CT & Indonesian Version)
          </p>
          
          {/* Kotak Scroll untuk Lisensi Panjang */}
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg h-28 overflow-y-auto text-[9px] font-mono text-gray-500">
            MIT License<br/><br/>
            Copyright (c) 2026 Maki (Mapping SNOMED CT & Indonesian Version)<br/>
            Copyright (c) 2026 ashemag (Original Framework)<br/><br/>
            Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:<br/><br/>
            The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.<br/><br/>
            THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
          </div>
          
          <p className="text-[10px] text-gray-400">
            Data model 3D anatomi disediakan oleh BodyParts3D © DBCLS (CC-BY-4.0).
          </p>
        </div>
        {/* AKHIR LISENSI DAN KREDIT */}
      </div>
    </section>
  )}
  <AnatomyChatbot />
 </main>;
}