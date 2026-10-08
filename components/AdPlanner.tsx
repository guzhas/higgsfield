"use client";

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { adDuration, buildAdPrompt, generationDuration, newAdPlan, planFromVoiceover, planIssues, sceneTimeline, type AdPlan, type AdScene } from '@/lib/ad-plan';
import type { VoiceoverImport } from '@/lib/voiceover-contract';
import type { AgentPackage } from '@/lib/agent-contract';
import { openComposer, type ComposerDraft } from '@/lib/composer';
import { adGenerationRequest } from '@/lib/ad-generation';
import { referenceLabel, validateReferences, type VideoReference } from '@/lib/video-references';
import { formatUsd, mediaUrl, STATUS_LABEL, isActive } from '@/lib/shared';
import { useJobs } from './useJobs';

const field = 'w-full rounded-xl border border-edge bg-panel-2 px-3 py-2.5 text-sm outline-none focus:border-accent';
const button = 'rounded-xl border border-edge px-3 py-2 text-xs hover:border-accent disabled:opacity-35 disabled:cursor-not-allowed';
const panel = 'rounded-2xl border border-edge bg-panel p-5';
interface Uploaded extends VideoReference { assetId: string; localUrl: string }
interface Quote { key: string; usd: number | null; note?: string }
const STORAGE_KEY = 'studio:ad-plan:v1';

export default function AdPlanner() {
  const [plan, setPlan] = useState<AdPlan>(newAdPlan);
  const [ready, setReady] = useState(false);
  const provider = plan.provider ?? 'openrouter';
  const setProvider = (provider: AdPlan['provider']) => setPlan(p => ({ ...p, provider }));
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [importedVoice, setImportedVoice] = useState<VoiceoverImport | null>(null);
  const [agentPackage, setAgentPackage] = useState<AgentPackage | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const savedFingerprint = useRef('');
  const { jobs, refresh } = useJobs('video');
  const timeline = sceneTimeline(plan);
  const duration = adDuration(plan);
  const issues = planIssues(plan);
  try { validateReferences(plan.references, 'references'); } catch (e) { issues.push(e instanceof Error ? e.message : 'Invalid references.'); }
  const videos = jobs.filter(j => j.status === 'completed').flatMap(j => j.outputs.filter(g => g.kind === 'video').map(g => ({ ...g, label: `${j.model_name} · ${j.prompt.slice(0, 45)}` })));
  const prompt = buildAdPrompt(plan);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const value = JSON.parse(saved);
        if (value.version === 1 && Array.isArray(value.scenes) && value.scenes.length > 0 && value.scenes.length <= 10 && Array.isArray(value.references)) setPlan(value);
      }
    } catch { setNotice('The saved plan could not be loaded. A new plan is ready.'); }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(plan)); }
    catch { setNotice('Browser storage is full. Download the plan to keep a copy.'); }
  }, [plan, ready]);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('voiceoverImport');
    if (!id) return;
    if (!/^[a-f0-9]{64}$/.test(id)) { setError('The Voiceovers import link is invalid.'); return; }
    const controller = new AbortController();
    setImportLoading(true);
    void fetch('/api/voiceover-import/' + id, { signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'The imported voiceover is unavailable.');
      setImportedVoice(data);
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Voiceover import failed.'); })
      .finally(() => { if (!controller.signal.aborted) setImportLoading(false); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('agentPlan');
    if (!id) return;
    if (!/^[a-f0-9]{64}$/.test(id)) { setError('The agent plan link is invalid.'); return; }
    const controller = new AbortController();
    void fetch('/api/agent/plans/' + id, { signal: controller.signal }).then(async r => {
      const data = await r.json(); if (!r.ok) throw new Error(data.error ?? 'Agent plan unavailable.'); setAgentPackage(data);
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Agent plan unavailable.'); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    setPlan(prev => {
      let changed = false;
      const scenes = prev.scenes.map(s => {
        const job = jobs.find(j => j.id === s.jobId);
        if (job?.status !== 'completed' || !job.outputs.length || s.source) return s;
        const output = job.outputs.find(g => g.kind === 'video');
        if (!output) return s;
        changed = true; return { ...s, source: { type: 'generation' as const, id: output.id }, trimStart: 0 };
      });
      return changed ? { ...prev, scenes } : prev;
    });
  }, [jobs]);
  const fingerprint = JSON.stringify(plan);
  useEffect(() => { if (savedFingerprint.current !== fingerprint) { setResult(null); savedFingerprint.current = fingerprint; } }, [fingerprint]);

  function updateScene(id: string, values: Partial<AdScene>) {
    setPlan(p => ({ ...p, scenes: p.scenes.map(s => s.id === id ? { ...s, ...values } : s) }));
  }
  function requestFor(index?: number) {
    return adGenerationRequest(plan, index);
  }
  async function quoteScene(index: number) {
    const scene = plan.scenes[index]; setBusy(`quote:${scene.id}`); setError(null);
    try {
      const request = requestFor(index); const key = JSON.stringify(request);
      const res = await fetch('/api/estimate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: key }); const data = await res.json();
      if (!res.ok || data.available === false) throw new Error(data.error ?? data.reason ?? 'Price estimate unavailable.');
      if (!data.metered && (!Number.isFinite(data.usd) || data.usd < 0)) throw new Error('No reliable price is available for this scene.');
      setQuotes(q => ({ ...q, [scene.id]: { key, usd: data.metered ? null : data.usd, note: data.note } }));
    } catch (e) { setError(e instanceof Error ? e.message : 'Price estimate failed.'); }
    finally { setBusy(null); }
  }
  async function generateScene(index: number) {
    const scene = plan.scenes[index]; setBusy(`generate:${scene.id}`); setError(null);
    try {
      const request = requestFor(index);
      if (quotes[scene.id]?.key !== JSON.stringify(request)) throw new Error('Check the updated price before generating.');
      const res = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) }); const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not start generation.');
      updateScene(scene.id, { jobId: data.id, source: undefined }); await refresh();
      setNotice('The scene is generating. Its clip will appear here when the request completes.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Generation failed.'); }
    finally { setBusy(null); }
  }
  async function upload(files: FileList | null, target: 'reference' | 'voice' | string) {
    if (!files?.length || uploading) return;
    setUploading(true); setError(null);
    try {
      for (const file of Array.from(files)) {
        if (target === 'voice' && !file.type.startsWith('audio/')) throw new Error('Choose WAV or MP3 for your voiceover.');
        if (target !== 'reference' && target !== 'voice' && !file.type.startsWith('video/')) throw new Error('Choose an MP4 or MOV clip.');
        const form = new FormData(); form.append('file', file);
        form.append(target === 'reference' ? 'validateReferences' : 'localOnly', '1');
        const res = await fetch('/api/upload', { method: 'POST', body: form }); const data = await res.json() as Uploaded & { error?: string };
        if (!res.ok) throw new Error(data.error ?? 'Upload failed.');
        if (target === 'reference') setPlan(p => ({ ...p, references: [...p.references, { ...data, purpose: data.kind === 'image' ? 'Product identity, packaging and label. Preserve these details.' : '' }] }));
        else if (target === 'voice') setPlan(p => ({ ...p, voiceAssetId: data.assetId, voiceDuration: data.duration, voiceName: data.name, voiceReferenceAssetId: undefined, references: p.references.filter(r => r.assetId !== p.voiceReferenceAssetId) }));
        else updateScene(target, { source: { type: 'asset', id: data.assetId }, trimStart: 0, jobId: undefined });
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed.'); }
    finally { setUploading(false); }
  }
  async function publishVoiceoverReference() {
    if (!plan.voiceAssetId || uploading) return;
    setUploading(true); setError(null);
    try {
      const local = await fetch('/api/reference-assets/' + encodeURIComponent(plan.voiceAssetId));
      if (!local.ok) throw new Error('The local voiceover is unavailable. Import it again.');
      const form = new FormData(); form.append('file', await local.blob(), 'voiceover.wav'); form.append('validateReferences', '1');
      const response = await fetch('/api/upload', { method: 'POST', body: form }); const asset = await response.json();
      if (!response.ok) throw new Error(asset.error ?? 'Reference upload failed.');
      if (!asset.assetId || asset.kind !== 'audio' || !asset.url?.startsWith('https://')) throw new Error('No public audio reference was returned.');
      setPlan(p => ({ ...p, voiceReferenceAssetId: asset.assetId, references: [...p.references.filter(r => r.assetId !== p.voiceReferenceAssetId),
        { ...asset, purpose: 'Complete spoken dialogue, timing, pauses and voice timbre for the fictional presenter. Guide mouth movements; no new words or translation.' }] }));
      setNotice('Recording uploaded as a model reference. No video generated. Check the complete prompt and price before Generate.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Audio reference upload failed.'); }
    finally { setUploading(false); }
  }
  async function exportAd() {
    setBusy('export'); setError(null); setResult(null);
    try {
      const res = await fetch('/api/ads/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clips: plan.scenes.map(s => ({ source: s.source, start: s.trimStart, duration: s.duration, caption: s.caption })), audioMode: plan.audioMode === 'reference' ? 'generated' : plan.audioMode, voiceAssetId: plan.voiceAssetId, aspectRatio: plan.aspectRatio, cta: plan.cta }) }); const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Export failed.');
      setResult(data.url); await refresh(); setNotice('The edited MP4 is ready and saved in your Library.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Export failed.'); }
    finally { setBusy(null); }
  }
  function downloadPlan() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'ad-plan.json'; a.click(); URL.revokeObjectURL(url);
  }
  const exportReady = plan.scenes.every(s => s.source) && duration >= 1 && duration <= 30 && (plan.audioMode !== 'original' || !!plan.voiceAssetId && (plan.voiceDuration ?? 0) >= duration - .05);

  return <div className="h-full overflow-y-auto">
    <header className="flex min-h-[68px] flex-wrap items-center justify-between gap-3 border-b border-edge-soft px-7 py-4"><div><h1 className="text-xl font-bold">Ad planner</h1><p className="mt-1 text-xs text-faint">Brief → references → timed scenes → preview → final MP4</p></div><div className="flex gap-2"><button onClick={downloadPlan} className={button}>Download plan</button><Link href="/prompts" className={button}>UGC & ad prompts</Link></div></header>
    <fieldset disabled={!!busy || uploading} className="mx-auto min-w-0 max-w-7xl space-y-5 p-4 lg:p-7">
      {error && <div role="alert" className="rounded-xl border border-danger/40 bg-panel p-3 text-sm text-danger">{error}<button onClick={() => setError(null)} className="float-right px-2" aria-label="Dismiss error">✕</button></div>}
      {notice && <p role="status" className="rounded-xl bg-panel-2 p-3 text-sm text-muted">{notice}<button onClick={() => setNotice(null)} className="float-right px-2" aria-label="Dismiss notice">✕</button></p>}
      {importLoading && <p role="status" className="text-sm text-muted">Loading your Voiceovers recording…</p>}
      {agentPackage && <section className={panel} aria-label="Agent video package">
        <h2 className="mb-2 font-semibold">Agent video package · {agentPackage.status}</h2>
        <p className="mb-3 text-sm text-muted">{agentPackage.brief.request}</p>
        {agentPackage.blockers.length > 0 && <ul className="mb-3 list-disc space-y-1 pl-5 text-xs text-warn">{agentPackage.blockers.map((b, i) => <li key={i}>{b}</li>)}</ul>}
        {agentPackage.warnings?.map((warning, i) => <p key={i} className="mb-2 text-xs text-warn">{warning}</p>)}
        <details className="mb-3"><summary className="cursor-pointer text-sm">Review compiled prompt and reference evidence</summary>
          <pre className="my-3 max-h-80 overflow-auto whitespace-pre-wrap text-xs">{agentPackage.prompt}</pre>
          {agentPackage.brief.references.map(r => <div key={r.assetId} className="my-3 flex gap-3 text-xs"><img alt={r.role} src={`/api/reference-assets/${r.assetId}`} className="h-20 w-28 rounded object-contain" /><p>{r.role}<br />{r.review?.observations}<br />{r.sourceUrl ? <a className="text-accent" href={r.sourceUrl} target="_blank" rel="noreferrer">Source</a> : r.provenance}{r.rights && ` · ${r.rights}`}</p></div>)}
        </details>
        <button className={button} disabled={!agentPackage.generationRequest} onClick={() => openComposer({ kind: 'video', ...agentPackage.generationRequest } as ComposerDraft)}>Review this video in Studio</button>
        <button className={`${button} ml-2`} onClick={() => { setPlan(agentPackage.adPlan); setAgentPackage(null); setNotice('Agent timeline loaded for editing. Use the compiled package in Studio for its original video brief.'); }}>Use timeline for local editing</button>
        <button className={`${button} ml-2`} onClick={() => setAgentPackage(null)}>Keep current plan</button>
        <p className="mt-3 text-xs text-faint">Loading a package starts no generation. Vision assessments come from the external agent. Audio-reference speech is experimental; exact lip sync remains unverified.</p>
      </section>}
      {importedVoice && <section className={panel} aria-label="Imported Voiceovers recording">
        <h2 className="font-semibold">Your Voiceovers recording is ready</h2>
        <p className="my-2 text-xs text-muted">{importedVoice.asset.duration.toFixed(3)}s · {importedVoice.manifest.language} · saved on this computer</p>
        <audio controls preload="metadata" src={importedVoice.asset.localUrl} className="w-full" />
        <details className="my-3 text-sm"><summary className="cursor-pointer text-muted">Read the voiceover text</summary><p className="mt-2 whitespace-pre-wrap">{importedVoice.manifest.text || 'Transcript not supplied. Add spoken words in the scene if available.'}</p></details>
        <p className="mb-3 text-xs leading-relaxed text-muted">Choose original soundtrack for product footage, or the experimental talking-video workflow under Audio & references. The recording stays local until you explicitly upload it as a provider reference. Exact lip sync with this WAV has not been verified for Seedance through OpenRouter.</p>
        <button className={button} onClick={() => { setPlan(planFromVoiceover(importedVoice)); setImportedVoice(null); setNotice('Voiceover loaded. Add your product, image references and visual action. Generate and export are separate actions.'); }}>Use recording in a new ad plan</button>
        <button className={`${button} ml-2`} onClick={() => setImportedVoice(null)}>Keep current plan</button>
        <p className="mt-2 text-xs text-faint">Using the recording replaces the current ad plan. Download your current plan first if you want to keep it. Importing starts no generation.</p>
      </section>}
      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <section className={panel}><h2 className="mb-4 text-base font-semibold">1. Product & direction</h2><label className="mb-3 block text-xs text-muted">Product and identity details<textarea aria-label="Product and identity details" rows={3} maxLength={3000} className={`${field} mt-1`} value={plan.product} onChange={e => setPlan(p => ({ ...p, product: e.target.value }))} placeholder="Product name, packaging, colors, logo, what it does. Include only claims you can support." /></label>
          <label className="mb-4 block text-xs text-muted">Audience & goal<input className={`${field} mt-1`} value={plan.audience} maxLength={500} onChange={e => setPlan(p => ({ ...p, audience: e.target.value }))} placeholder="Who is this for, and what should they do?" /></label>
          <div className="grid grid-cols-2 gap-3"><Choice label="Style" value={plan.style} choices={[['ugc', 'Authentic UGC'], ['cinematic', 'Cinematic ad']]} onChange={style => setPlan(p => ({ ...p, style: style as AdPlan['style'] }))} /><Choice label="Format" value={plan.aspectRatio} choices={[['9:16', '9:16 · Reels / TikTok'], ['16:9', '16:9 · Landscape'], ['1:1', '1:1 · Square']]} onChange={aspectRatio => setPlan(p => ({ ...p, aspectRatio: aspectRatio as AdPlan['aspectRatio'] }))} /><Choice label="Provider" value={provider} choices={[['openrouter', 'OpenRouter · Seedance 2.5'], ['higgsfield', 'Higgsfield · Seedance 2.5']]} onChange={v => setProvider(v as typeof provider)} /><Choice label="Generation quality" value={plan.resolution} choices={[['480p', '480p · Draft'], ['720p', '720p · Final']]} onChange={resolution => setPlan(p => ({ ...p, resolution: resolution as AdPlan['resolution'] }))} /></div>
          <p className="mt-3 text-xs leading-relaxed text-faint">Use a short 480p draft to check the action and product. Approve the best scenes before generating 720p versions. Reusing references and a prompt improves consistency; it does not guarantee an identical result.</p>
        </section>
        <section className={panel}><h2 className="mb-4 text-base font-semibold">2. Audio & references</h2><Choice label="Audio workflow" value={plan.audioMode} choices={[['original', 'My original voiceover · added in editing'], ['reference', 'Talking video from my audio · experimental'], ['generated', 'Model-generated speech and sound'], ['silent', 'Silent video']]} onChange={audioMode => setPlan(p => ({ ...p, audioMode: audioMode as AdPlan['audioMode'] }))} />
          {(plan.audioMode === 'original' || plan.audioMode === 'reference') && <div className="mt-3 space-y-2"><FileButton label={uploading ? 'Uploading…' : 'Choose local WAV / MP3'} accept="audio/wav,audio/x-wav,audio/mpeg" disabled={uploading || !!busy} onFiles={f => void upload(f, 'voice')} />{plan.audioMode === 'original' && <p className="text-xs text-faint">The visuals stay silent. Your recording is added directly in editing; it is not sent to the video model. A longer recording is trimmed to the ad duration.</p>}{plan.voiceAssetId && <><p className="text-xs">{plan.voiceName} · {plan.voiceDuration?.toFixed(3)}s / {duration}s planned</p><audio controls preload="metadata" src={`/api/reference-assets/${plan.voiceAssetId}`} className="w-full" />{(plan.voiceDuration ?? 0) < duration - .05 && <p className="text-xs text-warn">Your voiceover is shorter than the ad. Match the scene times to the full recording before exporting.</p>}</>}</div>}
          {plan.audioMode === 'reference' && <div className="mt-3 space-y-3 rounded-xl border border-warn/40 p-3">
            <p className="text-xs leading-relaxed text-muted">Seedance uses your recording to guide spoken words, voice and timing, with mouth synchronization requested in the prompt. The resulting audio is generated by the model; exact reproduction and lip sync are not verified. Use one complete generation for this workflow.</p>
            <label className="block text-xs text-muted">Speech language<input className={`${field} mt-1`} maxLength={80} value={plan.language} onChange={e => setPlan(p => ({ ...p, language: e.target.value }))} /></label>
            <p className="text-xs text-faint">The next button publishes a copy of your recording to Higgsfield storage so the selected video provider can access it. Its server-side key is required. This upload starts no generation.</p>
            <button className={button} disabled={!plan.voiceAssetId || uploading || !!busy} onClick={() => void publishVoiceoverReference()}>{plan.voiceReferenceAssetId ? 'Upload updated recording as reference' : 'Upload recording as model reference'}</button>
            {plan.voiceReferenceAssetId && <p role="status" className="text-xs text-accent">Audio reference attached. Add product images and visual action, review the full prompt and check the price.</p>}
            <p className="text-xs text-faint">A presenter can be invented from the prompt. Real-person face references were rejected by our current provider; voice-cloning consent does not authorize a portrait for Seedance.</p>
          </div>}
          {plan.audioMode === 'generated' && <div className="mt-3"><label className="text-xs text-muted">Speech language<input className={`${field} mt-1`} maxLength={80} value={plan.language} onChange={e => setPlan(p => ({ ...p, language: e.target.value }))} /></label><p className="mt-2 text-xs text-warn">Lithuanian speech quality is unverified. For exact wording and a consistent Lithuanian voice, use your original recording. Separate scenes may produce different voices.</p></div>}
          <div className="mt-5 border-t border-edge pt-4"><FileButton label="Add product / style / motion references" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,audio/wav,audio/x-wav,audio/mpeg" multiple disabled={uploading || !!busy} onFiles={f => void upload(f, 'reference')} /><p className="mt-2 text-xs text-faint">Uploads use Higgsfield storage. References guide identity and style; first/last-frame control is available separately in Video Studio.</p>
            <div className="mt-3 space-y-3">{plan.references.map((r, i) => <div key={r.url} className="rounded-xl bg-panel-2 p-3"><div className="flex items-center justify-between text-xs"><strong>{referenceLabel(plan.references, i, 'references')} · {r.name}</strong><button className="text-faint" onClick={() => setPlan(p => ({ ...p, references: p.references.filter((_, j) => j !== i) }))}>Remove</button></div><div className="mt-2">{r.kind === 'image' ? <img src={r.assetId ? `/api/reference-assets/${r.assetId}` : r.url} alt={r.name ?? 'Reference'} className="h-20 rounded object-contain" /> : r.kind === 'video' ? <video controls preload="metadata" src={r.assetId ? `/api/reference-assets/${r.assetId}` : r.url} className="h-24 rounded" /> : <audio controls preload="metadata" src={r.assetId ? `/api/reference-assets/${r.assetId}` : r.url} className="w-full" />}</div><input aria-label={`Role for ${referenceLabel(plan.references, i, 'references')}`} className={`${field} mt-2`} maxLength={300} value={r.purpose ?? ''} placeholder="Specify exactly what to copy from this file" onChange={e => setPlan(p => ({ ...p, references: p.references.map((v, j) => i === j ? { ...v, purpose: e.target.value } : v) }))} /></div>)}</div>
          </div>
        </section>
      </div>
      <section className={panel}><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">3. Scene timeline <span className="ml-2 font-mono text-accent">{duration}s</span></h2><p className="mt-1 text-xs text-faint">Timing in prompts is a direction. Final scene durations are enforced in editing.</p></div><button disabled={plan.scenes.length >= 10 || !!busy} className={button} onClick={() => setPlan(p => ({ ...p, scenes: [...p.scenes, { id: crypto.randomUUID(), duration: 5, visual: '', camera: '', narration: '', caption: '', trimStart: 0 }] }))}>+ Add scene</button></div>
        <div className="space-y-4">{timeline.map((scene, index) => {
          const job = jobs.find(j => j.id === scene.jobId); const working = job && isActive(job);
          let key = ''; try { key = JSON.stringify(requestFor(index)); } catch {}
          const quote = quotes[scene.id]; const validQuote = quote?.key === key;
          const selected = scene.source?.type === 'generation' ? videos.find(g => g.id === scene.source?.id) : null;
          const preview = scene.source?.type === 'asset' ? `/api/reference-assets/${scene.source.id}` : selected ? mediaUrl(selected) : null;
          return <article key={scene.id} className="grid gap-4 rounded-xl border border-edge bg-panel-2/40 p-4 lg:grid-cols-[1.5fr_1fr]">
            <div><div className="mb-3 flex items-center gap-3"><strong className="text-sm">Scene {index + 1} · {scene.start}–{scene.end}s</strong><label className="ml-auto text-xs">Length <input aria-label={`Scene ${index + 1} duration`} type="number" min={1} max={30} step="any" value={scene.duration} onChange={e => updateScene(scene.id, { duration: Number(e.target.value) })} className="ml-1 w-16 rounded border border-edge bg-panel p-1.5" /></label><button aria-label={`Remove scene ${index + 1}`} disabled={plan.scenes.length === 1 || !!busy} onClick={() => setPlan(p => ({ ...p, scenes: p.scenes.filter(s => s.id !== scene.id) }))} className="text-xs text-faint disabled:opacity-30">✕</button></div>
              <label className="block text-xs text-muted">Visible action<textarea aria-label={`Scene ${index + 1} action`} rows={3} maxLength={2500} className={`${field} mt-1`} value={scene.visual} onChange={e => updateScene(scene.id, { visual: e.target.value })} placeholder={index === 0 ? 'Hook: a believable problem or compelling product moment. One clear action.' : index === 1 ? 'Demonstration: show the product being used and the visible result.' : 'Resolution: a clear product shot and a natural ending.'} /></label>
              <label className="mt-2 block text-xs text-muted">Camera & composition<input className={`${field} mt-1`} value={scene.camera} maxLength={500} onChange={e => updateScene(scene.id, { camera: e.target.value })} /></label>
              {plan.audioMode !== 'silent' && <label className="mt-2 block text-xs text-muted">{plan.audioMode === 'generated' ? 'Exact spoken words' : plan.audioMode === 'reference' ? 'Spoken words · checked against audio reference' : 'Voiceover words at this time · planning only'}<textarea rows={2} maxLength={1200} className={`${field} mt-1`} value={scene.narration} onChange={e => updateScene(scene.id, { narration: e.target.value })} placeholder="Use the wording from your script; check that it fits this scene’s duration." /></label>}
              <label className="mt-2 block text-xs text-muted">Caption added in editing · optional<input className={`${field} mt-1`} value={scene.caption} maxLength={300} onChange={e => updateScene(scene.id, { caption: e.target.value })} placeholder="Short text in the final MP4, outside the model prompt" /></label>
            </div>
            <div className="space-y-3"><div className="grid min-h-44 place-items-center overflow-hidden rounded-xl border border-edge bg-bg">{preview ? <video key={preview} controls playsInline preload="metadata" src={preview} className="max-h-64 w-full" /> : <p className="px-4 text-center text-xs text-faint">Generate this scene or select an existing clip.</p>}</div>
              {job && <p className={`text-xs ${job.status === 'failed' || job.status === 'nsfw' || job.status === 'canceled' ? 'text-danger' : 'text-muted'}`}>{STATUS_LABEL[job.status]}{job.error ? ` · ${job.error}` : ''}</p>}
              <div className="flex flex-wrap gap-2"><button className={button} disabled={!!busy || uploading || issues.length > 0 || !!working} onClick={() => void quoteScene(index)}>{busy === `quote:${scene.id}` ? 'Checking…' : 'Check price'}</button><button className="rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-accent-ink disabled:opacity-35" disabled={!!busy || uploading || !validQuote || issues.length > 0 || !!working} onClick={() => void generateScene(index)}>{busy === `generate:${scene.id}` ? 'Starting…' : `Generate scene · ${validQuote ? quote.usd === null ? 'metered' : `~${formatUsd(quote.usd)}` : 'check price'}`}</button><button className={button} disabled={issues.length > 0 || !!busy} onClick={() => { try { const request = requestFor(index); openComposer({ kind: 'video', ...request }); } catch (e) { setError((e as Error).message); } }}>Edit prompt in Studio</button></div>
              {validQuote && quote.note && <p className="text-xs leading-relaxed text-faint">{quote.note}</p>}
              {generationDuration(plan, index) > scene.duration && <p className="text-xs text-faint">Generate {generationDuration(plan, index)}s, then trim to {scene.duration}s in the final edit.</p>}
              <label className="block text-xs text-muted">Use a saved video<select aria-label={`Scene ${index + 1} saved video`} className={`${field} mt-1`} value={scene.source?.type === 'generation' ? scene.source.id : ''} onChange={e => updateScene(scene.id, { source: e.target.value ? { type: 'generation', id: e.target.value } : undefined, jobId: undefined, trimStart: 0 })}><option value="">Select from Library…</option>{videos.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}</select></label>
              <div className="flex items-center gap-3"><FileButton label="Upload a clip" accept="video/mp4,video/quicktime" disabled={uploading || !!busy} onFiles={f => void upload(f, scene.id)} /><label className="text-xs">Trim start <input aria-label={`Scene ${index + 1} trim start`} className="ml-1 w-16 rounded border border-edge bg-panel p-1.5" type="number" min={0} step={.1} value={scene.trimStart} onChange={e => updateScene(scene.id, { trimStart: Number(e.target.value) })} /> s</label></div>
            </div>
          </article>;
        })}</div>
      </section>
      <div className="grid gap-5 xl:grid-cols-2"><section className={panel}><h2 className="mb-3 font-semibold">4. Review the complete prompt</h2>{issues.length > 0 && <ul className="mb-3 list-disc space-y-1 pl-5 text-xs text-warn">{issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>}<pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-bg p-4 font-mono text-xs leading-relaxed text-muted">{prompt}</pre><div className="mt-3 flex gap-2"><button className={button} onClick={() => void navigator.clipboard.writeText(prompt).then(() => setNotice('Prompt copied.')).catch(() => setError('Clipboard is unavailable. Select and copy the prompt text.'))}>Copy prompt</button><button className={button} disabled={issues.length > 0 || !!busy} onClick={() => { try { const request = requestFor(); openComposer({ kind: 'video', ...request }); } catch (e) { setError((e as Error).message); } }}>Review full ad in Studio</button></div><p className="mt-3 text-xs text-faint">For an original soundtrack, generate silent scenes and assemble them. For audio-reference speech, generate the complete timeline together. Shot timing remains approximate. Reference roles are appended to the submitted prompt.</p></section>
        <section className={panel}><h2 className="mb-3 font-semibold">5. Assemble & export</h2><label className="block text-xs text-muted">Final call to action · last 3 seconds<input className={`${field} mt-1`} maxLength={150} value={plan.cta} onChange={e => setPlan(p => ({ ...p, cta: e.target.value }))} placeholder="e.g. Atrask daugiau mūsų svetainėje" /></label><p className="my-3 text-xs leading-relaxed text-faint">Export combines the chosen clips, enforces scene times, preserves the frame with padding and adds your captions. Output: {plan.aspectRatio}, 720p MP4, 24 fps. Original voiceover replaces clip audio; generated and audio-reference modes keep each clip’s model-generated audio. Editing runs locally with FFmpeg and makes no generation request.</p><p className="mb-3 text-xs text-muted">{plan.scenes.filter(s => s.source).length}/{plan.scenes.length} clips selected · {duration}s · {plan.audioMode === 'original' ? 'original voiceover' : plan.audioMode === 'generated' ? 'clip audio' : plan.audioMode === 'reference' ? 'model audio guided by voiceover' : 'silent'}</p><button disabled={!exportReady || !!busy || uploading} onClick={() => void exportAd()} className="rounded-xl bg-accent px-5 py-3 text-sm font-bold text-accent-ink disabled:opacity-35">{busy === 'export' ? 'Rendering MP4…' : 'Export final MP4'}</button>{!exportReady && <p className="mt-2 text-xs text-faint">Select a clip for every scene and, when using original voiceover, upload a recording at least {duration}s long.</p>}{result && <div className="mt-4"><video controls playsInline src={result} className="max-h-96 w-full rounded-xl" /><a href={result} download="advertisement.mp4" className={`${button} mt-3 inline-block`}>Download MP4</a><Link href="/library" className="ml-4 text-xs text-accent">Open Library</Link></div>}</section></div>
      <p className="text-xs text-faint">{ready ? 'Plan saved in this browser automatically. Media files stay on this computer.' : 'Loading plan…'} Every Generate scene click makes a billable request. Check the brief, duration, reference permissions and price first.</p>
    </fieldset>
  </div>;
}

function Choice({ label, value, choices, onChange }: { label: string; value: string; choices: string[][]; onChange: (value: string) => void }) { return <label className="block text-xs text-muted">{label}<select aria-label={label} value={value} onChange={e => onChange(e.target.value)} className={`${field} mt-1`}>{choices.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label>; }
function FileButton({ label, accept, multiple, disabled, onFiles }: { label: string; accept: string; multiple?: boolean; disabled?: boolean; onFiles: (files: FileList | null) => void }) { return <label className={`${button} inline-flex cursor-pointer ${disabled ? 'pointer-events-none opacity-35' : ''}`}>{label}<input aria-label={label} className="hidden" type="file" accept={accept} multiple={multiple} disabled={disabled} onChange={e => { onFiles(e.target.files); e.target.value = ''; }} /></label>; }
