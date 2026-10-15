"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronRight, CircleHelp, Download, FileImage, FolderOpen, Home, ImagePlus, Layers3, LockKeyhole, Menu, Minus, PersonStanding, Plus, Printer, RotateCcw, Settings2, ShieldCheck, Sparkles, Wand2, X } from "lucide-react";
import { dictionaries, Key, Locale, locales } from "@/lib/i18n";
import BodyTemplate from "./BodyTemplate";
import { BodyGender, BodyView, regionsFor } from "@/lib/body-regions";

const API = process.env.NEXT_PUBLIC_API_URL || "";
type Screen = "home" | "projects" | "transfer" | "tryon" | "wrap" | "cover" | "create" | "print" | "settings";
type View = "compare" | "original" | "result" | "overlay";
type Crop = [number, number, number, number];
type Controls = { engine: "exact" | "outline" | "detailed"; design_lock: true; detail_level: number; line_weight: number; cleanup: number; mirror: boolean; background_remove: boolean; vectorize: boolean; source_type: "artwork" | "photo"; crop: Crop | null };
type SavedProject = { id: string; name: string; width: number; height: number; created: string; expires: string };
const initialControls: Controls = { engine: "exact", design_lock: true, detail_level: 3, line_weight: 0.5, cleanup: 40, mirror: false, background_remove: true, vectorize: false, source_type: "artwork", crop: null };
const nav: { id: Screen; icon: typeof Home }[] = [
  { id: "home", icon: Home }, { id: "projects", icon: FolderOpen }, { id: "transfer", icon: Layers3 },
  { id: "tryon", icon: PersonStanding }, { id: "wrap", icon: RotateCcw }, { id: "cover", icon: ShieldCheck }, { id: "create", icon: Wand2 }, { id: "print", icon: Printer },
];

async function request(path: string, options?: RequestInit) {
  const response = await fetch(`${API}${path}`, options);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error?.message || `HTTP ${response.status}`);
  }
  return response.json();
}

export default function AppPage() {
  const [locale, setLocale] = useState<Locale>("en");
  const [screen, setScreen] = useState<Screen>("home");
  const [project, setProject] = useState<SavedProject | null>(null);
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [controls, setControls] = useState<Controls>(initialControls);
  const [view, setView] = useState<View>("compare");
  const [split, setSplit] = useState(50);
  const [overlay, setOverlay] = useState(50);
  const [zoom, setZoom] = useState(100);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorText, setErrorText] = useState("");
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [hasResult, setHasResult] = useState(false);
  const [hasWorkSource, setHasWorkSource] = useState(false);
  const [imageVersion, setImageVersion] = useState(0);
  const [widthMm, setWidthMm] = useState(120);
  const [heightMm, setHeightMm] = useState(120);
  const [unit, setUnit] = useState<"mm" | "cm">("mm");
  const [tile, setTile] = useState(true);
  const [marks, setMarks] = useState(true);
  const [overlapMm, setOverlapMm] = useState(10);
  const [transparent, setTransparent] = useState(true);
  const [printMirror, setPrintMirror] = useState(false);
  const [bodyGender, setBodyGender] = useState<BodyGender>("male");
  const [bodyView, setBodyView] = useState<BodyView>("front");
  const [bodyRegion, setBodyRegion] = useState("right-forearm");
  const [placement, setPlacement] = useState({x: 17, y: 41, width: 22, rotation: 0, opacity: 75});
  const [dragging, setDragging] = useState(false);
  const [mobileControls, setMobileControls] = useState(false);
  const [cropping, setCropping] = useState(false);
  const [cropDraft, setCropDraft] = useState<Crop | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cropStart = useRef<[number, number] | null>(null);
  const jobRun = useRef(0);
  const t = useCallback((key: Key) => dictionaries[locale][key], [locale]);
  const checkBackend = useCallback(async () => {
    try {
      const response = await fetch(`${API}/api/v1/health`, { cache: "no-store" });
      setApiOnline(response.ok && (await response.json()).status === "ok");
    } catch { setApiOnline(false); }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("twb_locale") as Locale | null;
    const language = saved && locales.includes(saved) ? saved : (navigator.language.slice(0, 2) as Locale);
    setLocale(locales.includes(language) ? language : "en");
    try {
      const list: SavedProject[] = JSON.parse(localStorage.getItem("twb_projects") || "[]");
      const active = list.filter(p => new Date(p.expires).getTime() > Date.now());
      setProjects(active);
      localStorage.setItem("twb_projects", JSON.stringify(active));
    } catch { /* ignore damaged local storage */ }
  }, []);
  useEffect(() => { document.documentElement.lang = locale; localStorage.setItem("twb_locale", locale); }, [locale]);
  useEffect(() => { if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {}); }, []);
  useEffect(() => { void checkBackend(); const timer = window.setInterval(() => void checkBackend(), 15000); return () => window.clearInterval(timer); }, [checkBackend]);

  const sourceUrl = project ? `${API}/api/v1/projects/${project.id}/preview?type=${hasResult && hasWorkSource && !cropping ? "work_source" : "source"}&v=${imageVersion}` : "";
  const resultUrl = project && hasResult ? `${API}/api/v1/projects/${project.id}/preview?type=transfer&v=${imageVersion}` : "";
  const saveProjects = (items: SavedProject[]) => { setProjects(items); localStorage.setItem("twb_projects", JSON.stringify(items)); };

  async function upload(file: File) {
    if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 25 * 1024 * 1024) { setErrorText(t("fileError")); return; }
    setBusy(true); setErrorText(""); setHasResult(false); setHasWorkSource(false); setProgress(0);
    try {
      const created = await request("/api/v1/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name.replace(/\.[^.]+$/, ""), locale, mode: "transfer" }) });
      const form = new FormData(); form.append("file", file);
      const uploaded = await request(`/api/v1/projects/${created.project_id}/source`, { method: "POST", body: form });
      const item: SavedProject = { id: created.project_id, name: created.name, width: uploaded.width_px, height: uploaded.height_px, created: created.created_at, expires: created.expires_at };
      setProject(item); saveProjects([item, ...projects].slice(0, 12));
      setControls({...initialControls, source_type: uploaded.suggested_source_type === "photo" ? "photo" : "artwork"}); setCropDraft(null); setCropping(false); setWidthMm(120); setHeightMm(Math.round(120 * item.height / item.width)); setScreen("transfer");
    } catch (error) { void checkBackend(); setErrorText(error instanceof Error ? error.message : t("failed")); }
    finally { setBusy(false); }
  }

  async function runTransfer(next: Controls = controls) {
    if (!project) return;
    const run = ++jobRun.current;
    setBusy(true); setErrorText(""); setProgress(0);
    try {
      const started = await request(`/api/v1/projects/${project.id}/transfer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      for (let attempt = 0; attempt < 120; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 350));
        if (run !== jobRun.current) return;
        const job = await request(`/api/v1/jobs/${started.job_id}`);
        setProgress(job.progress || 0);
        if (job.status === "completed") { setHasWorkSource(true); setHasResult(true); setImageVersion(v => v + 1); if (job.metrics?.width_px && job.metrics?.height_px) setHeightMm(Math.round(widthMm * job.metrics.height_px / job.metrics.width_px * 10) / 10); setCropping(false); setView("compare"); setBusy(false); return; }
        if (job.status === "failed" || job.status === "superseded") throw new Error(job.error?.message || t("failed"));
      }
      throw new Error(t("failed"));
    } catch (error) { if (run === jobRun.current) setErrorText(error instanceof Error ? error.message : t("failed")); }
    finally { if (run === jobRun.current) setBusy(false); }
  }

  // Reprocess the actual uploaded source whenever a control changes after the first result.
  useEffect(() => {
    if (!hasResult || !project) return;
    const timer = window.setTimeout(() => { void runTransfer(controls); }, 650);
    return () => window.clearTimeout(timer);
    // project id and control values are the intended triggers; completion must not queue another run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls, project?.id]);

  async function download(kind: "png" | "pdf") {
    if (!project || !hasResult) return;
    setErrorText(""); setBusy(true);
    try {
      const payload = kind === "png" ? { transparent_background: transparent, mirror: printMirror, resolution: "working" }
        : { width_mm: widthMm, height_mm: heightMm, lock_aspect_ratio: true, paper_size: "A4", orientation: "portrait", scale_percent: 100, mirror: printMirror, tile, overlap_mm: overlapMm, registration_marks: marks };
      const result = await request(`/api/v1/projects/${project.id}/export/${kind}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const response = await fetch(`${API}${result.download_url}`);
      if (!response.ok) throw new Error(t("failed"));
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = `tattoo-workbench-${project.name}.${kind}`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (error) { setErrorText(error instanceof Error ? error.message : t("failed")); }
    finally { setBusy(false); }
  }

  async function openProject(item: SavedProject) {
    setErrorText(""); setProject(item); setScreen("transfer"); setHasResult(false); setHasWorkSource(false);
    try { const state = await request(`/api/v1/projects/${item.id}`); if (state.status === "completed") { setHasWorkSource(Boolean(state.assets?.work_source)); setHasResult(true); setImageVersion(v => v + 1); if (state.controls) setControls({...initialControls, ...state.controls}); if (state.metrics?.width_px && state.metrics?.height_px) setHeightMm(Math.round(widthMm * state.metrics.height_px / state.metrics.width_px * 10) / 10); } }
    catch { saveProjects(projects.filter(p => p.id !== item.id)); setProject(null); setErrorText(t("failed")); }
  }

  async function deleteProject(item: SavedProject) {
    try { await request(`/api/v1/projects/${item.id}`, { method: "DELETE" }); } catch { /* expired is already gone */ }
    saveProjects(projects.filter(p => p.id !== item.id));
    if (project?.id === item.id) { setProject(null); setHasResult(false); setScreen("projects"); }
  }

  function changeWidth(value: number) { const mm = unit === "cm" ? value * 10 : value; setWidthMm(mm); if (project) setHeightMm(Math.round(mm * project.height / project.width * 10) / 10); }
  function cropPoint(e: React.PointerEvent<HTMLDivElement>): [number, number] {
    const rect = e.currentTarget.getBoundingClientRect();
    return [Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)), Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))];
  }
  function cropMove(e: React.PointerEvent<HTMLDivElement>, finish = false) {
    if (!cropping || !cropStart.current) return;
    const [x, y] = cropPoint(e);
    const [sx, sy] = cropStart.current;
    const next: Crop = [Math.min(sx, x), Math.min(sy, y), Math.max(sx, x), Math.max(sy, y)];
    setCropDraft(next);
    if (finish) {
      cropStart.current = null;
      if (next[2] - next[0] >= 0.05 && next[3] - next[1] >= 0.05) {
        setControls(c => ({...c, crop: next}));
        setCropping(false);
      }
    }
  }
  function selectBodyRegion(id: string) {
    const region = regionsFor(bodyView).find(item => item.id === id);
    if (!region) return;
    setBodyRegion(id);
    setPlacement(p => ({...p, x: region.x / 3.6, y: region.y / 7.2, width: Math.max(12, Math.min(35, region.w / 3.6))}));
  }
  const route = (next: Screen) => { setScreen(next); setMobileControls(false); setErrorText(""); };
  const navItem = (item: { id: Screen; icon: typeof Home }, small = false) => {
    const Icon = item.icon;
    return <button key={item.id} className={`nav-item ${screen === item.id ? "active" : ""} ${small ? "compact" : ""}`} onClick={() => route(item.id)} aria-label={t(item.id)}><Icon size={19} strokeWidth={1.8}/><span>{t(item.id)}</span>{["wrap", "cover", "create"].includes(item.id) && !small && <i className="soon-dot"/>}</button>;
  };

  const selectedRegion = regionsFor(bodyView).find(item => item.id === bodyRegion) || regionsFor(bodyView)[0];
  return <div className="shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => route("home")} aria-label="Tattoo Workbench"><span className="brand-mark"/><span className="brand-name">Tattoo <span>Workbench</span><small>PROFESSIONAL WORKSPACE</small></span></button>
      <div className="side-section">WORKSPACE</div>
      <nav>{nav.map(item => navItem(item))}</nav>
      <div className="side-bottom">{navItem({id:"settings",icon:Settings2})}<div className="side-note"><ShieldCheck size={16}/><span>{t("privacy")}</span></div></div>
    </aside>

    <div className="main-area">
      <header className="topbar"><div className="topbar-mobile"><span className="mini-mark"/> Tattoo <span>Workbench</span></div><div className="breadcrumb">WORKSPACE <ChevronRight size={14}/> <strong>{t(screen)}</strong></div><div className="top-actions"><span className="engine-pill"><span/> {t("engine")}</span><select aria-label={t("language")} value={locale} onChange={e => setLocale(e.target.value as Locale)}><option value="en">EN</option><option value="ru">RU</option><option value="es">ES</option><option value="pt">PT</option></select></div></header>

      {apiOnline === false && <div className="error-banner backend-banner" role="status">{t("backendOffline")}<button onClick={() => void checkBackend()}>{t("retry")}</button></div>}
      {errorText && <div className="error-banner" role="alert">{errorText}<button aria-label="Close" onClick={() => setErrorText("")}><X size={16}/></button></div>}

      {screen === "home" && <main className="home-content"><div className="home-hero"><div className="eyebrow"><span className="eyebrow-line"/> PROFESSIONAL TATTOO WORKSPACE</div><h1>From reference<br/>to <em>tattoo-ready.</em></h1><p>{t("subtitle")}</p><div className="hero-glow"/></div><div className={`home-upload ${dragging ? "dragging" : ""}`} onDragOver={e => {e.preventDefault();setDragging(true)}} onDragLeave={() => setDragging(false)} onDrop={e => {e.preventDefault();setDragging(false);if(e.dataTransfer.files[0])void upload(e.dataTransfer.files[0]);}}><span className="home-upload-mark"><ImagePlus size={30}/></span><h2>{t("uploadHint")}</h2><p>{t("uploadTypes")}</p><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => {if(e.target.files?.[0])void upload(e.target.files[0]);}}/><div className="home-upload-actions"><button className="primary-button" onClick={() => fileInput.current?.click()} disabled={busy}>{busy?t("processing"):t("chooseFile")}<Plus size={17}/></button><button className="text-button" onClick={() => route("projects")}>{t("openProject")}<ArrowRight size={16}/></button></div></div><section className="home-section"><div className="section-title"><div><span className="eyebrow">YOUR TOOLS</span><h2>{t("tools")}</h2></div></div><div className="tool-grid">{nav.filter(x => !["home","projects"].includes(x.id)).map((item, index) => { const Icon = item.icon; return <button key={item.id} className={`tool-card ${index === 0 || item.id === "print" || item.id === "tryon" ? "featured" : ""}`} onClick={() => route(item.id)}><span className="tool-icon"><Icon size={25} strokeWidth={1.6}/></span><span><strong>{t(item.id)}</strong><small>{index === 0 ? t("exact") : item.id === "print" ? t("preparePrint") : item.id === "tryon" ? t("previewPlacement") : t("soon")}</small></span><ArrowRight size={18}/></button>; })}</div></section><section className="home-section"><div className="section-title"><div><span className="eyebrow">YOUR WORK</span><h2>{t("recent")}</h2></div><button className="text-button" onClick={() => route("projects")}>{t("projects")} <ArrowRight size={15}/></button></div>{projects.length ? <div className="recent-grid">{projects.slice(0,3).map(p => <button key={p.id} className="project-card" onClick={() => void openProject(p)}><img src={`${API}/api/v1/projects/${p.id}/preview?type=source`} alt=""/><span><strong>{p.name}</strong><small>{new Date(p.created).toLocaleDateString(locale)}</small></span><ChevronRight size={16}/></button>)}</div> : <div className="empty-recent"><FileImage size={24}/>{t("emptyProjects")}</div>}</section></main>}

      {screen === "transfer" && <main className="work-layout"><div className="work-center"><div className="work-header"><div><div className="eyebrow">EXACT COPY STUDIO</div><h1>{project ? project.name : t("uploadTitle")}</h1><p>{project ? controls.source_type==="photo" ? t("photoCaveat") : t("quality") : t("subtitle")}</p></div>{hasResult && <div className="work-header-actions"><button className="secondary-button" onClick={() => route("tryon")}><PersonStanding size={17}/>{t("tryon")}</button><button className="primary-button export-top" onClick={() => route("print")}><Printer size={17}/>{t("preparePrint")}</button></div>}</div>
        {project && controls.source_type==="photo" && <div className="photo-guide"><div><strong>{t("tattooPhoto")}</strong><p>{t("cropHelp")}</p></div><div className="photo-guide-actions"><button className="secondary-button" onClick={()=>{setCropping(true);setView("original");}}>{t("cropTattoo")}</button><button className="primary-button" disabled={busy} onClick={()=>void runTransfer()}>{hasResult?t("regenerate"):t("generate")}</button></div></div>}
        {!project ? <div className={`upload-zone ${dragging ? "dragging" : ""}`} onDragOver={e => {e.preventDefault();setDragging(true)}} onDragLeave={() => setDragging(false)} onDrop={e => {e.preventDefault();setDragging(false); if(e.dataTransfer.files[0]) void upload(e.dataTransfer.files[0]);}}><div className="upload-icon"><ImagePlus size={34} strokeWidth={1.4}/></div><h2>{t("uploadHint")}</h2><p>{t("uploadTypes")}</p><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => {if (e.target.files?.[0]) void upload(e.target.files[0]);}}/><button className="primary-button" onClick={() => fileInput.current?.click()} disabled={busy}>{busy ? t("processing") : t("chooseFile")}<ArrowRight size={16}/></button><div className="privacy-line"><ShieldCheck size={15}/>{t("privacy")}</div></div> : <div className="canvas-shell"><div className="canvas-toolbar"><div className="segmented">{(["compare","original","result","overlay"] as View[]).map(v => <button key={v} className={view === v ? "selected" : ""} onClick={() => setView(v)} disabled={!hasResult && v !== "original"}>{t(v === "result" ? "result" : v)}</button>)}</div><div className="zoom-tools"><button onClick={() => setZoom(z => Math.max(50,z-25))} aria-label="Zoom out"><Minus size={16}/></button><span>{zoom}%</span><button onClick={() => setZoom(z => Math.min(200,z+25))} aria-label="Zoom in"><Plus size={16}/></button></div></div><div className="artboard"><div className={`image-stack ${cropping ? "crop-active" : ""}`} style={{transform:`scale(${zoom/100})`}} onPointerDown={e=>{if(!cropping)return; e.currentTarget.setPointerCapture(e.pointerId); cropStart.current=cropPoint(e); setCropDraft(null);}} onPointerMove={e=>cropMove(e)} onPointerUp={e=>cropMove(e,true)}><img className="source-image" src={sourceUrl} alt={t("source")}/>{cropping && cropDraft && <div className="crop-rectangle" style={{left:`${cropDraft[0]*100}%`,top:`${cropDraft[1]*100}%`,width:`${(cropDraft[2]-cropDraft[0])*100}%`,height:`${(cropDraft[3]-cropDraft[1])*100}%`}}/>}{hasResult && (view === "result" || view === "overlay" || view === "compare") && <img className={`result-image ${view === "overlay" ? "overlay-image" : ""}`} style={view === "compare" ? {clipPath:`inset(0 0 0 ${split}%)`} : view === "overlay" ? {opacity: overlay / 100} : {}} src={resultUrl} alt={t("result")}/ >}{hasResult && view === "compare" && <div className="split-line" style={{left:`${split}%`}}><span>↔</span></div>}</div>{busy && <div className="processing-overlay"><span className="spinner"/><strong>{t("generating")}</strong><small>{progress}%</small></div>}</div>{hasResult && view === "compare" && <div className="compare-range"><span>{t("original")}</span><input aria-label={t("compare")} type="range" min="0" max="100" value={split} onChange={e=>setSplit(Number(e.target.value))}/><span>{t("result")}</span></div>}{hasResult && view === "overlay" && <div className="compare-range"><span>{t("original")}</span><input aria-label={t("overlay")} type="range" min="0" max="100" value={overlay} onChange={e=>setOverlay(Number(e.target.value))}/><span>{t("result")}</span></div>}</div>}
      </div><aside className={`properties ${mobileControls ? "open" : ""}`}><div className="properties-heading"><div><span className="eyebrow">CONFIGURATION</span><h2>{t("controls")}</h2></div><button className="close-mobile" onClick={()=>setMobileControls(false)}><X size={20}/></button></div><div className="property-scroll"><div className="lock-card"><span className="lock-icon"><LockKeyhole size={20}/></span><span><strong>{t("designLock")} <b>ON</b></strong><small>{t("lockHint")}</small></span></div><div className="control-group"><label>{t("sourceKind")}</label><div className="mode-pills"><button className={controls.source_type==="artwork"?"chosen":""} onClick={()=>setControls(c=>({...c,source_type:"artwork"}))}>{t("artworkSource")}</button><button className={controls.source_type==="photo"?"chosen":""} onClick={()=>setControls(c=>({...c,source_type:"photo"}))}>{t("tattooPhoto")}</button></div>{controls.source_type==="photo" && <p className="source-caveat">{t("photoCaveat")}</p>}</div><div className="control-group"><label>{t("cropTattoo")}</label><button className="secondary-button full" onClick={()=>{setCropping(true);setView("original");setMobileControls(false);}} disabled={!project}>{t("cropTattoo")}</button>{controls.crop && <button className="text-button crop-reset" onClick={()=>{setControls(c=>({...c,crop:null}));setCropDraft(null);}}>{t("resetCrop")}</button>}<p className="source-caveat">{t("cropHelp")}</p></div><div className="control-group"><label>{t("selectMode")}</label><div className="mode-pills">{(["exact","outline","detailed"] as const).map(m=><button key={m} className={controls.engine===m?"chosen":""} onClick={()=>setControls(c=>({...c,engine:m,detail_level:m==="outline"?2:m==="detailed"?4:3}))}>{t(m)}</button>)}</div></div><div className="control-group"><label htmlFor="detail">{t("detail")} <strong>{controls.detail_level}/5</strong></label><input id="detail" type="range" min="1" max="5" step="1" value={controls.detail_level} onChange={e=>setControls(c=>({...c,detail_level:Number(e.target.value)}))}/><div className="range-labels"><span>ESSENTIAL</span><span>FULL</span></div></div><div className="control-group"><label htmlFor="weight">{t("weight")} <strong>{controls.line_weight.toFixed(1)} mm</strong></label><input id="weight" type="range" min="0.2" max="1" step="0.1" value={controls.line_weight} onChange={e=>setControls(c=>({...c,line_weight:Number(e.target.value)}))}/><div className="range-labels"><span>THIN</span><span>THICK</span></div></div><div className="control-group"><label htmlFor="cleanup">{t("cleanup")} <strong>{controls.cleanup}%</strong></label><input id="cleanup" type="range" min="0" max="100" step="5" value={controls.cleanup} onChange={e=>setControls(c=>({...c,cleanup:Number(e.target.value)}))}/><div className="range-labels"><span>ORIGINAL</span><span>CLEAN</span></div></div><label className="toggle-row"><span><strong>{t("mirror")}</strong><small>HORIZONTAL FLIP</small></span><input type="checkbox" checked={controls.mirror} onChange={e=>setControls(c=>({...c,mirror:e.target.checked}))}/><i/></label><label className="toggle-row"><span><strong>{t("transparent")}</strong><small>PNG EXPORT</small></span><input type="checkbox" checked={transparent} onChange={e=>setTransparent(e.target.checked)}/><i/></label></div><div className="properties-footer"><button className="primary-button full" disabled={!project||busy} onClick={()=>void runTransfer()}>{busy?t("generating"):hasResult?t("regenerate"):t("generate")}<Sparkles size={17}/></button><button className="secondary-button full" disabled={!hasResult||busy} onClick={()=>void download("png")}><Download size={17}/>{t("exportPng")}</button>{hasResult && <button className="text-button full" onClick={()=>route("print")}>{t("preparePrint")} <ArrowRight size={16}/></button>}</div></aside><button className="mobile-controls-button" onClick={()=>setMobileControls(true)}><Settings2 size={17}/>{t("controls")}</button></main>}

      {screen === "tryon" && <main className="tryon-content"><div className="page-heading"><div className="eyebrow">PLACEMENT PREVIEW</div><h1>{t("tryon")}</h1><p>{t("bodyPreviewNote")}</p></div>{project && hasResult ? <div className="tryon-grid"><section className="tryon-map-panel"><div className="tryon-switch"><button className={bodyGender==="male"?"chosen":""} onClick={()=>setBodyGender("male")}>{t("male")}</button><button className={bodyGender==="female"?"chosen":""} onClick={()=>setBodyGender("female")}>{t("female")}</button></div><div className="tryon-switch"><button className={bodyView==="front"?"chosen":""} onClick={()=>setBodyView("front")}>{t("frontView")}</button><button className={bodyView==="back"?"chosen":""} onClick={()=>setBodyView("back")}>{t("backView")}</button></div><p className="map-hint">{t("selectArea")}</p><div className="body-map"><BodyTemplate gender={bodyGender} view={bodyView} selected={bodyRegion} locale={locale} onSelect={selectBodyRegion}/></div><div className="region-list">{regionsFor(bodyView).map(region=><button key={region.id} className={region.id===bodyRegion?"selected":""} onClick={()=>selectBodyRegion(region.id)}>{region.labels[locale]}</button>)}</div></section><section className="tryon-preview-panel"><div className="tryon-preview-head"><div><span className="eyebrow">{t("previewPlacement")}</span><h2>{selectedRegion.labels[locale]}</h2></div><span>{bodyView === "front" ? t("frontView") : t("backView")}</span></div><div className="tryon-stage"><div className="tryon-scene" style={{transformOrigin:`${placement.x}% ${placement.y}%`}}><BodyTemplate gender={bodyGender} view={bodyView} selected={bodyRegion} locale={locale}/><img className="tryon-tattoo" src={resultUrl} alt={t("result")} style={{left:`${placement.x}%`,top:`${placement.y}%`,width:`${placement.width}%`,transform:`translate(-50%, -50%) rotate(${placement.rotation}deg)`,opacity:placement.opacity/100}}/></div></div><div className="placement-controls"><label>{t("placementSize")} <strong>{placement.width}%</strong><input type="range" min="8" max="60" value={placement.width} onChange={e=>setPlacement(p=>({...p,width:Number(e.target.value)}))}/></label><label>{t("placementRotate")} <strong>{placement.rotation}°</strong><input type="range" min="-180" max="180" value={placement.rotation} onChange={e=>setPlacement(p=>({...p,rotation:Number(e.target.value)}))}/></label><label>{t("placementOpacity")} <strong>{placement.opacity}%</strong><input type="range" min="20" max="100" value={placement.opacity} onChange={e=>setPlacement(p=>({...p,opacity:Number(e.target.value)}))}/></label><label>{t("horizontalPosition")} <strong>{placement.x}%</strong><input type="range" min="4" max="96" value={placement.x} onChange={e=>setPlacement(p=>({...p,x:Number(e.target.value)}))}/></label><label>{t("verticalPosition")} <strong>{placement.y}%</strong><input type="range" min="5" max="95" value={placement.y} onChange={e=>setPlacement(p=>({...p,y:Number(e.target.value)}))}/></label></div><p className="preview-disclaimer">{t("placementHint")}</p><button className="primary-button full" onClick={()=>route("print")}>{t("preparePrint")}<ArrowRight size={16}/></button></section></div> : <div className="empty-state"><PersonStanding size={40}/><h2>{t("noResult")}</h2><button className="primary-button" onClick={()=>route("transfer")}>{t("goTransfer")}</button></div>}</main>}

      {screen === "print" && <main className="print-content"><div className="page-heading"><div className="eyebrow">PRINT / EXPORT</div><h1>{t("printTitle")}</h1><p>{t("printNote")}</p></div>{project && hasResult ? <div className="print-grid"><div className="print-preview"><div className="sheet"><div className="sheet-ruler">0 · 50 · 100 · 150 · 210 mm</div><div className="sheet-viewport"><div className="print-art" style={{width:`${widthMm/210*100}%`,height:`${heightMm/297*100}%`,transform:printMirror?"scaleX(-1)":undefined}}><img src={resultUrl} alt={t("result")}/></div></div><span>{widthMm.toFixed(1)} × {heightMm.toFixed(1)} mm</span></div><div className="print-hint"><ShieldCheck size={16}/>{t("quality")}</div></div><div className="print-panel"><h2>{t("actualSize")}</h2><div className="size-grid"><label>{t("width")}<input type="number" min="5" max="2000" step="1" value={unit==="cm"?widthMm/10:widthMm} onChange={e=>changeWidth(Number(e.target.value))}/></label><label>{t("height")}<input type="number" value={unit==="cm"?(heightMm/10).toFixed(1):heightMm.toFixed(1)} readOnly/></label><label>{t("unit")}<select value={unit} onChange={e=>setUnit(e.target.value as "mm"|"cm")}><option value="mm">mm</option><option value="cm">cm</option></select></label></div><div className="print-divider"/><label className="field-label">{t("paper")}<select value="A4" disabled><option>A4 · 210 × 297 mm</option></select></label><label className="toggle-row"><span><strong>{t("stencilMirror")}</strong></span><input type="checkbox" checked={printMirror} onChange={e=>setPrintMirror(e.target.checked)}/><i/></label><label className="toggle-row"><span><strong>{t("tiling")}</strong><small>A4</small></span><input type="checkbox" checked={tile} onChange={e=>setTile(e.target.checked)}/><i/></label><label className="toggle-row"><span><strong>{t("marks")}</strong></span><input type="checkbox" checked={marks} onChange={e=>setMarks(e.target.checked)}/><i/></label><div className="control-group"><label htmlFor="overlap">{t("overlap")} <strong>{overlapMm} mm</strong></label><input id="overlap" type="range" min="0" max="20" step="5" value={overlapMm} onChange={e=>setOverlapMm(Number(e.target.value))}/></div><button className="primary-button full" disabled={busy} onClick={()=>void download("pdf")}><Download size={18}/>{t("exportPdf")}</button><button className="secondary-button full" disabled={busy} onClick={()=>void download("png")}><Download size={18}/>{t("exportPng")}</button></div></div> : <div className="empty-state"><Printer size={40}/><h2>{t("noResult")}</h2><button className="primary-button" onClick={()=>route("transfer")}>{t("goTransfer")}<ArrowRight size={17}/></button></div>}</main>}

      {screen === "projects" && <main className="simple-content"><div className="page-heading"><div className="eyebrow">YOUR WORK</div><h1>{t("projects")}</h1><p>{t("privacy")}</p></div><button className="primary-button" onClick={()=>{setProject(null);setHasResult(false);route("transfer")}}><Plus size={18}/>{t("newTransfer")}</button><div className="projects-list">{projects.length ? projects.map(p=><div key={p.id} className="project-row"><img src={`${API}/api/v1/projects/${p.id}/preview?type=source`} alt=""/><span><strong>{p.name}</strong><small>{new Date(p.created).toLocaleString(locale)} · {p.width} × {p.height} px</small></span><button className="secondary-button" onClick={()=>void openProject(p)}>{t("openProject")}</button><button className="icon-button" aria-label={t("delete")} onClick={()=>void deleteProject(p)}><X size={18}/></button></div>) : <div className="empty-state"><FolderOpen size={38}/><h2>{t("emptyProjects")}</h2></div>}</div></main>}
      {screen === "settings" && <main className="simple-content"><div className="page-heading"><div className="eyebrow">PREFERENCES</div><h1>{t("settingsTitle")}</h1></div><div className="settings-card"><label>{t("language")}<select value={locale} onChange={e=>setLocale(e.target.value as Locale)}><option value="en">English</option><option value="ru">Русский</option><option value="es">Español</option><option value="pt">Português</option></select></label><div><strong>{t("engine")}</strong><p>{t("about")}</p></div><div><strong>{t("privacy")}</strong></div></div></main>}
      {["wrap","cover","create"].includes(screen) && <main className="simple-content"><div className="page-heading"><div className="eyebrow">TATTOO WORKBENCH</div><h1>{t(screen)}</h1></div><div className="empty-state"><Sparkles size={42}/><h2>{t("unavailable")}</h2><button className="primary-button" onClick={()=>route("transfer")}>{t("goTransfer")}<ArrowRight size={17}/></button></div></main>}
    </div>
    <nav className="mobile-nav">{[nav[0],nav[2],nav[3],nav[7],{id:"settings" as Screen,icon:Settings2}].map(item=>navItem(item,true))}</nav>
  </div>;
}
