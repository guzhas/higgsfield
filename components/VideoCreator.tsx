'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { DirectorInput, DirectorPrepared, ReferenceRole } from '@/lib/director-contract';
import { useJobs } from './useJobs';
import { mediaUrl } from '@/lib/shared';
import SceneAudioControls from './SceneAudioControls';

const defaults: DirectorInput={requestId:'',concept:'',dialogue:'',language:'lt',voiceMode:'recording',voiceId:'',recordingAssetId:'',location:'',locationMode:'real',weather:'Švelni dienos šviesa, nestiprus vėjas.',environment:'',camera:'Natūralus interviu: vidutinis planas akių lygyje, lengvas kameros judėjimas. Kalbančio žmogaus veidas aiškiai matomas.',subjectDescription:'',wardrobeDescription:'',propsDescription:'',autoGenerateReferences:true,aspectRatio:'9:16',resolution:'720p',duration:20,minimumLocationReferences:3,references:[]};
type Preview={assetId:string;localUrl:string;name?:string;duration?:number};
type Voice={id:string;name:string;category:string;available:boolean};
type Review={transcript:string;visualObservations:string[];audioObservations:string[];issues:string[];lipSyncAssessment:string};
const roles:Record<ReferenceRole,string>={face:'Veidas',location:'Vieta',wardrobe:'Apranga',prop:'Objektas',style:'Stilius',scene:'Visa pradinė scena'};
const storageKey='studio:video-creator:v1';
const control='creator-control';
async function api(action:string,body:Record<string,unknown>={}){
  const res=await fetch('/api/director',{method:'POST',headers:{'Content-Type':'application/json','X-Video-Agent':'studio-v1'},body:JSON.stringify({action,...body})});
  const data=await res.json();if(!res.ok)throw new Error(data.error??'Veiksmas nepavyko.');return data;
}
function Field({title,hint,children}: {title:string;hint?:string;children:React.ReactNode}){
  return <label className="creator-field"><span>{title}</span>{children}{hint&&<small>{hint}</small>}</label>;
}
function Section({title,description,children}: {title:string;description:string;children:React.ReactNode}){
  return <section className="creator-section"><div className="creator-section-head"><h2>{title}</h2><p>{description}</p></div><div>{children}</div></section>;
}
function UploadIcon(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5" strokeLinecap="round" strokeLinejoin="round"/></svg>;}
export default function VideoCreator(){
  const [input,setInput]=useState(defaults),[hydrated,setHydrated]=useState(false);
  const [previews,setPreviews]=useState<Preview[]>([]),[recording,setRecording]=useState<Preview|null>(null);
  const [prepared,setPrepared]=useState<DirectorPrepared|null>(null),[jobId,setJobId]=useState('');
  const [voices,setVoices]=useState<Voice[]>([]),[voiceKey,setVoiceKey]=useState(''),[voiceConfigured,setVoiceConfigured]=useState(false);
  const [config,setConfig]=useState<{openRouterConfigured:boolean;storageConfigured:boolean;referenceTransportIssue?:string|null}|null>(null);
  const [busy,setBusy]=useState(''),[error,setError]=useState(''),[budget,setBudget]=useState(10),[exportId,setExportId]=useState('');
  const {jobs,refresh}=useJobs('video'); const job=jobs.find(j=>j.id===jobId),exported=jobs.find(j=>j.id===exportId);
  const output=job?.outputs.find(o=>o.kind==='video'),finalOutput=exported?.outputs.find(o=>o.kind==='video');
  const preparingRef=useRef(false);
  const [review,setReview]=useState<Review|null>(null);
  async function reviewVideo(){if(!prepared||!output)return;setBusy('AI peržiūri video ir klausosi garso…');setError('');try{setReview(await api('review',{id:prepared.id,outputId:output.id}));}catch(e){setError((e as Error).message);}finally{setBusy('');}}
  async function recover(requestId:string){
    const r=await fetch('/api/director?action=recover&requestId='+encodeURIComponent(requestId));const d=await r.json();
    if(!r.ok)throw new Error(d.error);if(d.prepared)setPrepared(d.prepared);return d;
  }
  const change=<K extends keyof DirectorInput>(key:K,value:DirectorInput[K])=>{setInput(p=>({...p,[key]:value}));if(!jobId)setPrepared(null);setError('');};
  function chooseVoiceMode(voiceMode: DirectorInput['voiceMode']) {
    setInput(p=>({...p,voiceMode,...(voiceMode==='clone'&&p.acoustics?{acoustics:{...p.acoustics,referenceContent:'speech_only',ambienceMode:'generate_from_scene',referenceAcoustics:'unknown'}}:{})}));
    if(!jobId)setPrepared(null);setError('');
  }
  useEffect(()=>{
    try{const saved=JSON.parse(localStorage.getItem(storageKey)??'null');if(saved?.input&&Array.isArray(saved.input.references)){setInput({...defaults,...saved.input});setPreviews(saved.previews??[]);setRecording(saved.recording??null);setPrepared(saved.prepared??null);setJobId(saved.jobId??'');setExportId(saved.exportId??'');}}
    catch{/* A malformed draft starts a new form. */}setHydrated(true);
    void fetch('/api/director').then(r=>r.json()).then(d=>{setConfig(d);setVoiceConfigured(Boolean(d.elevenConfigured));}).catch(()=>setError('Nepavyko pasiekti studijos serverio. Perkrauk puslapį.'));
    void loadVoices();
  },[]);
  useEffect(()=>{if(hydrated)try{localStorage.setItem(storageKey,JSON.stringify({input,previews,recording,prepared,jobId,exportId}));}catch{setError('Naršyklė negali išsaugoti juodraščio. Neišjunk puslapio, kol baigsi.');}},[hydrated,input,previews,recording,prepared,jobId,exportId]);
  async function loadVoices(){try{const r=await fetch('/api/director?action=voices');const d=await r.json();if(!r.ok)throw new Error(d.error);setVoices(d.voices??[]);setVoiceConfigured(Boolean(d.configured));}catch(e){setError(e instanceof Error?e.message:'Nepavyko įkelti balsų.');}}
  async function connect(){setBusy('Jungiama balso biblioteka…');setError('');try{const d=await api('connectVoice',{key:voiceKey});setVoices(d.voices);setVoiceConfigured(true);setVoiceKey('');}catch(e){setError((e as Error).message);}finally{setBusy('');}}
  async function upload(files:FileList|null,role:ReferenceRole|'recording'){
    if(!files?.length)return;setBusy('Įkeliami failai…');setError('');setPrepared(null);
    try{
      if(role!=='recording'&&input.references.length+files.length>24)throw new Error('Galima įkelti iki 24 nuotraukų.');
      for(const f of Array.from(files)){
        const form=new FormData();form.append('file',f);form.append('localOnly','1');if(role!=='recording')form.append('normalizeReference','1');
        const res=await fetch('/api/upload',{method:'POST',headers:{'X-Video-Agent':'studio-v1'},body:form});const asset=await res.json();if(!res.ok)throw new Error(asset.error);
        if(role==='recording'){setRecording(asset);setInput(p=>({...p,recordingAssetId:asset.assetId}));}
        else{setPreviews(p=>[...p,asset]);setInput(p=>({...p,references:[...p.references,{assetId:asset.assetId,role,instruction:''}]}));}
      }
    }catch(e){setError((e as Error).message);}finally{setBusy('');}
  }
  function remove(id:string){setInput(p=>({...p,references:p.references.filter(r=>r.assetId!==id)}));setPreviews(p=>p.filter(r=>r.assetId!==id));setPrepared(null);}
  function uploadControl(role:ReferenceRole,title:string,description:string){return <label className="creator-upload"><UploadIcon/><strong>{title}</strong><span>{description}</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={Boolean(busy)} onChange={e=>{void upload(e.target.files,role);e.target.value='';}}/></label>;}
  function referenceList(allowed:ReferenceRole[]){return <div className="creator-ref-list">{input.references.filter(r=>allowed.includes(r.role)).map(r=>{
    const preview=previews.find(p=>p.assetId===r.assetId);return <div className="creator-ref" key={r.assetId}>
      {/* User files are previewed by the user, never passed to an identity-analysis model. */}
      <img src={preview?.localUrl??'/api/reference-assets/'+r.assetId} alt={`${roles[r.role]}: ${preview?.name??'įkelta nuotrauka'}`}/>
      <div><label><span>Nuorodos paskirtis</span><select className={control} value={r.role} onChange={e=>{change('references',input.references.map(x=>x.assetId===r.assetId?{...x,role:e.target.value as ReferenceRole}:x));}}>{Object.entries(roles).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <label><span>Kaip naudoti šią nuotrauką?</span><input className={control} maxLength={280} placeholder={r.role==='prop'?'Pvz., tokia mikrofono forma; be logotipo.':r.role==='wardrobe'?'Pvz., tokio kirpimo ir spalvos kostiumas.':'Pvz., tik išvaizda; nuotraukos fono nekopijuoti.'} value={r.instruction} onChange={e=>change('references',input.references.map(x=>x.assetId===r.assetId?{...x,instruction:e.target.value}:x))}/></label></div>
      <button type="button" className="creator-remove" aria-label={`Pašalinti ${preview?.name??roles[r.role]}`} onClick={()=>remove(r.assetId)}>Pašalinti</button>
    </div>;
  })}</div>;}
  async function prepare(){
    if(preparingRef.current)return;preparingRef.current=true;setBusy('AI rengia sceną, ieško vietos ir ruošia nuorodas…');setError('');
    try{const next={...input,requestId:crypto.randomUUID()};setInput(next);const d=await api('prepare',{input:next});setPrepared(d);setJobId('');setExportId('');setReview(null);}
    catch(e){setError((e as Error).message+' Paruošto paketo būseną gali patikrinti nekartodamas mokamos užklausos.');}finally{setBusy('');preparingRef.current=false;}
  }
  async function generate(){if(!prepared)return;setBusy('Seedance užklausa siunčiama…');setError('');try{const d=await api('generate',{id:prepared.id,maximumUsd:budget});setJobId(d.id);void refresh();}catch(e){setError((e as Error).message);}finally{setBusy('');}}
  async function finish(){if(!prepared||!output)return;setBusy('Išsaugomas galutinis MP4…');setError('');try{const r=await fetch('/api/ads/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clips:[{source:{type:'generation',id:output.id},start:0,duration:prepared.duration,caption:''}],audioMode:prepared.input.voiceMode==='silent'?'silent':'generated',aspectRatio:prepared.input.aspectRatio,cta:''})});const d=await r.json();if(!r.ok)throw new Error(d.error);setExportId(d.jobId);void refresh();}catch(e){setError((e as Error).message);}finally{setBusy('');}}
  const hasLocation=input.references.some(r=>r.role==='location');
  const canPrepare=Boolean(input.concept.trim()&&input.location.trim()&&(input.voiceMode==='silent'||input.dialogue.trim()&&(input.voiceMode==='clone'?input.voiceId:input.recordingAssetId)));
  return <div className="creator-scroll"><div className="creator-shell">
    <header className="creator-header"><div><h1>Kurti video</h1><p>Tavo balsas, žmogus ir scena. Vienas paruoštas paketas Seedance.</p></div><Link href="/library" className="creator-link">Video biblioteka <span aria-hidden="true">→</span></Link></header>
    {config?.referenceTransportIssue&&<div className="creator-alert" role="status">{config.referenceTransportIssue}</div>}
    {config&&(!config.openRouterConfigured||!config.storageConfigured)&&<div className="creator-alert" role="status">{!config.openRouterConfigured?'Trūksta OpenRouter rakto. ':''}{!config.storageConfigured?'Pasirinkta nuorodų saugykla nesukonfigūruota. ':''}<Link href="/settings">Atidaryti nustatymus</Link></div>}
    <div className="creator-layout"><form onSubmit={e=>{e.preventDefault();void prepare();}} className="creator-form"><fieldset disabled={Boolean(busy)} className="creator-fields">
      <Section title="Video idėja" description="Aprašyk, kas vyksta kadre. Kalbos tekstą įrašyk atskirai.">
        <Field title="Ką norėtum pamatyti?"><textarea className={control} rows={3} maxLength={3000} value={input.concept} onChange={e=>change('concept',e.target.value)} placeholder="Pvz., žmogus atsako į žurnalisto klausimą Katedros aikštėje. Žurnalistas už kadro, mikrofonas matomas."/></Field>
        <div className="creator-two"><Field title="Formatas"><select className={control} value={input.aspectRatio} onChange={e=>change('aspectRatio',e.target.value as DirectorInput['aspectRatio'])}><option value="9:16">Vertikalus · 9:16</option><option value="16:9">Horizontalus · 16:9</option><option value="1:1">Kvadratinis · 1:1</option></select></Field><Field title="Vaizdo kokybė"><select className={control} value={input.resolution} onChange={e=>change('resolution',e.target.value as DirectorInput['resolution'])}><option value="720p">720p · galutiniam video</option><option value="480p">480p · pigesniam bandymui</option></select></Field></div>
      </Section>
      <Section title="Balsas ir kalba" description="Naudok paruoštą įrašą arba įgarsink tekstą pasirinktu balsu.">
        <div className="creator-tabs" role="group" aria-label="Įgarsinimo būdas">{(['recording','clone','silent'] as const).map(v=><button type="button" key={v} aria-pressed={input.voiceMode===v} onClick={()=>chooseVoiceMode(v)}>{v==='recording'?'Mano MP3 / WAV':v==='clone'?'Klonuotas balsas':'Be kalbos'}</button>)}</div>
        <SceneAudioControls value={input.acoustics} voiceMode={input.voiceMode} disabled={Boolean(busy)} onChange={value=>change('acoustics',value)}/>
        {input.voiceMode==='recording'&&<><label className="creator-audio-upload"><UploadIcon/><span><strong>{recording?.name??'Įkelti paruoštą įgarsinimą'}</strong><small>{recording?.duration?`${recording.duration.toFixed(2)} sek.`:'MP3 arba WAV · 5–30 sek. · ne balso klonavimo pavyzdys'}</small></span><input type="file" accept="audio/mpeg,audio/wav,audio/x-wav" onChange={e=>{void upload(e.target.files,'recording');e.target.value='';}}/></label>{recording&&<audio controls src={recording.localUrl} className="creator-audio"/>}</>}
        {input.voiceMode==='clone'&&<><Field title="Balso biblioteka"><select className={control} value={input.voiceId} onChange={e=>change('voiceId',e.target.value)}><option value="">Pasirink balsą</option>{voices.map(v=><option value={v.id} key={v.id}>{v.name} · {v.category==='cloned'?'klonuotas':v.category}</option>)}</select></Field><button type="button" className="creator-link" onClick={()=>void loadVoices()}>Atnaujinti balsus</button>
          {!voiceConfigured&&<div className="creator-connect"><Field title="Prijungti ElevenLabs biblioteką" hint="Raktas laikomas tik serverio atmintyje iki perkrovimo; juodraštyje neišsaugomas."><input type="password" className={control} autoComplete="off" value={voiceKey} onChange={e=>setVoiceKey(e.target.value)} placeholder="ElevenLabs API raktas"/></Field><button type="button" className="creator-secondary" disabled={!voiceKey.trim()} onClick={()=>void connect()}>Prijungti balsus</button></div>}
        </>}
        {input.voiceMode!=='silent'?<><Field title={input.voiceMode==='recording'?'Tikslus įraše sakomas tekstas':'Tekstas įgarsinimui'} hint={input.voiceMode==='recording'?'Tekstas turi sutapti su įrašu. Jo neperrašysime ir balso nekursime iš naujo.':'Prieš ElevenLabs AI sutvarkys lietuviškas raides ir gramatiką. Prekių ženklų pavadinimai išlaikomi.'}><textarea className={control} rows={5} maxLength={input.voiceMode==='clone'?450:12000} value={input.dialogue} onChange={e=>change('dialogue',e.target.value)} placeholder="Čia įrašyk tik sakomus žodžius…"/></Field><Field title="Kalba"><select className={control} value={input.language} onChange={e=>change('language',e.target.value as 'lt'|'en')}><option value="lt">Lietuvių</option><option value="en">Anglų</option></select></Field></>:<Field title="Trukmė, sekundėmis"><input className={control} type="number" min={5} max={30} value={input.duration} onChange={e=>change('duration',Number(e.target.value))}/></Field>}
      </Section>
      <Section title="Žmogus ir išvaizda" description="Nuotraukos perduodamos kaip veido ir išvaizdos nuorodos. Jų fonas nepriskiriamas video vietai.">{uploadControl('face','Įkelti veido nuotraukas','JPG, PNG arba WebP · galima kelios')}{referenceList(['face'])}<Field title="Išvaizdos aprašymas" hint="Jei nėra veido nuotraukų, AI gali sukurti išgalvoto žmogaus nuorodą pagal šį aprašymą."><textarea className={control} rows={2} maxLength={2000} value={input.subjectDescription??''} onChange={e=>change('subjectDescription',e.target.value)} placeholder="Pvz., išgalvotas 35 metų vyras trumpais rudais plaukais, natūrali išvaizda…"/></Field></Section>
      <Section title="Vieta" description="Įkelk norimą foną arba leisk AI rasti vietą pagal aprašymą.">
        <div className="creator-tabs" role="group" aria-label="Vietos tipas"><button type="button" aria-pressed={input.locationMode==='real'} onClick={()=>change('locationMode','real')}>Tikra vieta</button><button type="button" aria-pressed={input.locationMode==='fantasy'} onClick={()=>change('locationMode','fantasy')}>Fantastinė aplinka</button></div>
        <Field title={input.locationMode==='real'?'Kur vyksta video?':'Aprašyk įsivaizduojamą vietą'}><textarea className={control} rows={2} value={input.location} maxLength={1500} onChange={e=>change('location',e.target.value)} placeholder={input.locationMode==='real'?'Vilnius, Katedros aikštė. Už žmogaus matoma katedra ir varpinė.':'Virš debesų plūduriuojantis sodas su stikliniais tiltais…'}/></Field>
        {uploadControl('location','Įkelti vietos nuotraukas','Pasirinktinai · jei turi norimo rakurso nuotraukų')}{referenceList(['location'])}
        <div className="creator-location-note">{hasLocation?'AI naudos tavo įkeltas vietos nuorodas. Automatinė paieška nereikalinga.':input.locationMode==='fantasy'?'AI gali sukurti fantastinės vietos nuorodą, o Seedance pagal ją kurs aplinką. Tikros vietos vaizdų neieškosime.':'Be vietos nuotraukų AI ieškos Wikimedia Commons vaizdų, tikrins vietą, rakursą ir naudojimo licenciją.'}</div>
        {!hasLocation&&input.locationMode==='real'&&<Field title="Kiek vietos nuorodų rasti?"><select className={control} value={input.minimumLocationReferences} onChange={e=>change('minimumLocationReferences',Number(e.target.value))}>{[1,2,3,4,5].map(v=><option value={v} key={v}>{v} nuotraukos</option>)}</select></Field>}
      </Section>
      <Section title="Apranga ir papildomi objektai" description="Kiekvienai nuotraukai priskirk paskirtį: kostiumas, mikrofonas, rekvizitas ar vaizdo stilius."><div className="creator-two">{uploadControl('wardrobe','Aprangos nuoroda','Kostiumas, drabužiai, aksesuarai')}{uploadControl('prop','Objekto nuoroda','Mikrofonas, produktas, rekvizitas')}</div>{referenceList(['wardrobe','prop','style'])}<Field title="Aprangos aprašymas"><textarea className={control} rows={2} maxLength={2000} value={input.wardrobeDescription??''} onChange={e=>change('wardrobeDescription',e.target.value)} placeholder="Tamsiai mėlynas vilnonis paltas, smėlio spalvos megztinis…"/></Field><Field title="Papildomi objektai"><textarea className={control} rows={2} maxLength={2000} value={input.propsDescription??''} onChange={e=>change('propsDescription',e.target.value)} placeholder="Smėlio spalvos kepurė, juodas mikrofonas be užrašų…"/></Field><label className="creator-auto"><input type="checkbox" checked={input.autoGenerateReferences??false} onChange={e=>change('autoGenerateReferences',e.target.checked)}/><span>AI sugeneruoja trūkstamas nuorodas pagal aprašymą <small>Iki 4 papildomų vaizdų. Tai mokamas paruošimo etapas.</small></span></label></Section>
      <Section title="Oras, aplinka ir kamera" description="Šios detalės aprašo visą sceną ir padeda išlaikyti vientisumą."><Field title="Oras ir šviesa"><input className={control} maxLength={1000} value={input.weather} onChange={e=>change('weather',e.target.value)} placeholder="Debesuota, po lietaus, šilta vakaro šviesa…"/></Field><Field title="Aplinkos detalės"><textarea className={control} rows={3} maxLength={2000} value={input.environment} onChange={e=>change('environment',e.target.value)} placeholder="Praeiviai tolumoje, grindinys, lengvas vėjas. Mikrofoną laiko žurnalistas už kadro…"/></Field><Field title="Kameros darbas"><textarea className={control} rows={3} maxLength={1000} value={input.camera} onChange={e=>change('camera',e.target.value)}/></Field></Section>
    </fieldset><div className="creator-form-action"><p>AI paruošimas ir naujas ElevenLabs įgarsinimas yra mokamos API užklausos. Video kaina bus parodyta prieš jo generavimą.</p><button type="submit" className="creator-primary" disabled={Boolean(busy)||!canPrepare}>{busy||'Paruošti video'}</button>{input.requestId&&!prepared&&<button type="button" className="creator-secondary" disabled={Boolean(busy)} onClick={()=>{void recover(input.requestId).then(d=>{if(!d.prepared)setError(d.status==='preparing'?'Paruošimas dar vyksta.':'Paketo nėra arba paruošimas nutrūko; užklausa nepakartota.');}).catch(e=>setError(e.message));}}>Patikrinti ankstesnį paruošimą</button>}</div></form>
    <aside className="creator-review"><div className="creator-review-sticky"><h2>{prepared?'Paruošta generuoti':'Tavo video paketas'}</h2><p className="creator-review-intro">{prepared?'Peržiūrėk įgarsinimą, vietos vaizdus ir kainą.':'Viskas, ką gaus modelis, bus surinkta čia prieš generavimą.'}</p>
      <dl className="creator-summary"><div><dt>Modelis</dt><dd>Seedance 2.5</dd></div><div><dt>Formatas</dt><dd>{input.aspectRatio} · {input.resolution}</dd></div><div><dt>Balsas</dt><dd>{input.voiceMode==='recording'?'Tavo įgarsinimas':input.voiceMode==='silent'?'Be kalbos':voices.find(v=>v.id===input.voiceId)?.name??'Nepasirinktas'}</dd></div><div><dt>Nuotraukos</dt><dd>{input.references.length} įkeltos{prepared&&prepared.sources.length?` + ${prepared.sources.length} rastos`:''}</dd></div><div><dt>Vieta</dt><dd>{input.location||'Dar neaprašyta'}</dd></div></dl>
      {prepared?<><div className="creator-ready-detail"><strong>{prepared.duration.toFixed(2)} sek.</strong><span>Modeliui siunčiama {prepared.modelDuration} sek. užklausa.</span></div>{prepared.audioUrl&&<><audio controls src={prepared.audioUrl} className="creator-audio"/><p className="creator-quality-note">Tai kalbos nuorodos peržiūra. Scenos akustiką kuria Seedance; šiame įraše jos dar negalima įvertinti.</p></>}
        {prepared.transcript&&<details className="creator-details"><summary>Paruoštas kalbos tekstas</summary><p>{prepared.transcript}</p></details>}
        {prepared.references.some(r=>r.instruction.startsWith('AI sukurta:'))&&<div className="creator-found"><h3>AI sukurtos nuorodos</h3><div>{prepared.references.filter(r=>r.instruction.startsWith('AI sukurta:')).map(r=><a key={r.assetId} href={r.localUrl} target="_blank" rel="noreferrer"><img src={r.localUrl} alt={r.instruction}/><span>{roles[r.role as ReferenceRole]??r.role}</span></a>)}</div></div>}
        {prepared.sources.length>0&&<div className="creator-found"><h3>Rastos vietos nuorodos</h3><div>{prepared.sources.map(s=><a key={s.assetId} href={s.page} target="_blank" rel="noreferrer"><img src={'/api/reference-assets/'+s.assetId} alt={s.observations}/><span>{s.license}</span></a>)}</div><details className="creator-details"><summary>Šaltiniai ir autorystė</summary>{prepared.sources.map(s=><p key={s.assetId}><a href={s.page} target="_blank" rel="noreferrer">{s.title}</a> — {s.author}, {s.license}</p>)}</details></div>}
        <details className="creator-details"><summary>Visa Seedance instrukcija</summary><pre>{prepared.prompt}</pre></details>
        <div className="creator-price"><span>Video generavimas</span><strong>${prepared.estimatedUsd.toFixed(2)}</strong></div><Field title="Maksimalus video biudžetas, USD"><input className={control} type="number" min={0.01} step={0.5} value={budget} onChange={e=>setBudget(Number(e.target.value))}/></Field>
        <button className="creator-primary" type="button" onClick={()=>void generate()} disabled={Boolean(busy)||Boolean(jobId)||budget<prepared.estimatedUsd}>Generuoti video · ${prepared.estimatedUsd.toFixed(2)}</button>
        {prepared.warnings.map(w=><p className="creator-quality-note" key={w}>{w}</p>)}
      </>:<div className="creator-empty"><UploadIcon/><p>Aprašyk sceną ir pasirink balsą. Vietos nuorodas galime surasti už tave.</p></div>}
      {busy&&<p role="status" aria-live="polite" className="creator-progress">{busy} Neišjunk puslapio.</p>}
      {error&&<div className="creator-alert" role="alert">{error}</div>}
      {job&&<div className="creator-result"><h3>{job.status==='completed'?'Video paruoštas':job.status==='failed'||job.status==='nsfw'?'Generavimas nepavyko':'Video generuojamas'}</h3><p>{job.error??({pending:'Užklausa laukia eilėje.',queued:'Seedance priėmė užklausą.',in_progress:'Seedance kuria vaizdą ir garsą.',downloading:'Išsaugomas rezultatas.',completed:'Peržiūrėk žodžius, balsą ir lūpų sutapimą.',failed:'Bandymas automatiškai nekartojamas.',nsfw:'Tiekėjas atmetė užklausą.',canceled:'Užklausa atšaukta.'}[job.status])}</p>{output&&<><video src={mediaUrl(finalOutput??output)??undefined} controls playsInline/><button type="button" className="creator-secondary" disabled={Boolean(busy)} onClick={()=>void reviewVideo()}>AI rezultato patikra</button><small>Pirma AI peržiūra yra mokama; išsaugotas rezultatas naudojamas pakartotinai.</small>{review&&<details className="creator-details" open><summary>AI peržiūros pastabos</summary><p>{review.transcript}</p>{[...review.visualObservations,...review.audioObservations,...review.issues].map((note,i)=><p key={i}>{note}</p>)}<p>{review.lipSyncAssessment}</p><small>Automatinė peržiūra negali patvirtinti tikslaus kiekvieno garso ir lūpų sutapimo arba balso tapatybės.</small></details>}<button type="button" className="creator-secondary" disabled={Boolean(busy)||Boolean(exportId)} onClick={()=>void finish()}>Išsaugoti galutinį MP4</button></>}{exported&&!finalOutput&&<p>{exported.error??'Rengiamas galutinis failas…'}</p>}{finalOutput&&<a className="creator-primary" href={mediaUrl(finalOutput)??undefined} download>Atsisiųsti MP4</a>}<Link className="creator-link" href="/library">Atidaryti bibliotekoje</Link></div>}
    </div></aside></div>
  </div></div>;
}

