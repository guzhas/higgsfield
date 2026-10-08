import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readAsset, assetPath } from './reference-assets';
import { assertVoiceoverRequest, readVoiceoverImport } from './voiceover-import';
import { referenceLabel, validateReferences, withReferenceRoles, type VideoReference } from './video-references';
import { newAdPlan, generationDuration } from './ad-plan';
import { parseGenerationRequest } from './payload';
import type { AgentBrief, AgentPackage } from './agent-contract';
import { speechLanguageEvidence, referenceSpeechDirection, REFERENCE_AUDIO_DESIGN } from './seedance-speech';
import { parseSceneAcoustics, sceneAudioDirection, sceneAudioWarnings } from './scene-audio';

export const AGENT_DIR = path.join(process.cwd(), 'storage', 'agent-plans');
export class AgentError extends Error { constructor(message: string, public status = 400) { super(message); } }
function fail(message: string): never { throw new AgentError(message); }
export function assertAgentRequest(req: Request, mutation = false) {
  const origin = assertVoiceoverRequest(req);
  if (mutation && req.headers.get('x-video-agent') !== 'studio-v1') throw new AgentError('X-Video-Agent: studio-v1 is required.', 403);
  return origin;
}
export async function agentJson(req: Request) {
  if (!req.headers.get('content-type')?.startsWith('application/json')) throw new AgentError('Use application/json.', 415);
  const reader = req.body?.getReader(); if (!reader) fail('A JSON body is required.');
  let size = 0; const parts: Uint8Array[] = [];
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length;
    if (size > 128 * 1024) { await reader.cancel(); throw new AgentError('Brief exceeds 128 KiB.', 413); } parts.push(value); }
    return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown;
  } catch (e) { if (e instanceof AgentError) throw e; fail('Invalid JSON.'); }
}
function obj(value: unknown, fields: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !fields.includes(k))) fail(`Invalid ${label} or unsupported fields.`);
  return value as Record<string, unknown>;
}
function str(value: unknown, label: string, max = 3000, empty = false): string {
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > max) fail(`Invalid ${label}.`);
  return value.trim();
}
function choice<T extends string>(value: unknown, options: T[], label: string): T {
  if (!options.includes(value as T)) fail(`Invalid ${label}.`); return value as T;
}
function https(value: unknown) { const s = str(value, 'source URL', 2000); let u: URL; try { u = new URL(s); } catch { fail('Invalid source URL.'); }
  if (u.protocol !== 'https:' || u.username || u.password) fail('Source pages need HTTPS without credentials.'); return s; }
export function parseAgentBrief(value: unknown): AgentBrief {
  const r = obj(value, ['schemaVersion','request','format','subject','location','dialogue','audio','scenes','references','finishing'], 'brief');
  if (r.schemaVersion !== 1) fail('Use schemaVersion 1.');
  const f = obj(r.format, ['aspectRatio','resolution'], 'format'), s = obj(r.subject, ['kind','description','permission'], 'subject');
  const l = obj(r.location, ['name','viewpoint','minimumReferences'], 'location'), d = obj(r.dialogue, ['text','language','delivery'], 'dialogue');
  const a = obj(r.audio, ['mode','voiceoverImportId','referenceAssetId','soundscape','acoustics'], 'audio');
  let acoustics: AgentBrief['audio']['acoustics'];
  if (a.acoustics !== undefined) {
    try { acoustics = parseSceneAcoustics(a.acoustics); } catch (e) { fail((e as Error).message); }
    if (a.mode === 'native' && acoustics.ambienceMode === 'preserve_reference') fail('Native audio has no finished reference ambience to preserve. Choose scene generation or dialogue only.');
  }
  if (!Array.isArray(r.scenes) || !r.scenes.length || r.scenes.length > 10) fail('Use 1–10 scenes.');
  const scenes = r.scenes.map(v => { const x = obj(v, ['duration','action','camera','caption'], 'scene');
    if (typeof x.duration !== 'number' || !Number.isFinite(x.duration) || x.duration < 1 || x.duration > 30) fail('Scene lengths must be 1–30s.');
    return { duration: x.duration, action: str(x.action, 'action'), camera: str(x.camera, 'camera', 500), ...(x.caption === undefined ? {} : { caption: str(x.caption, 'editing caption', 300, true) }) }; });
  const total = scenes.reduce((sum, x) => sum + x.duration, 0); if (total < 4 || total > 30) fail('Each complete generation must be 4–30s. Split longer requests into continuity-linked clips.');
  if (!Number.isInteger(l.minimumReferences) || (l.minimumReferences as number) < 0 || (l.minimumReferences as number) > 30) fail('minimumReferences must be 0–30.');
  if (!Array.isArray(r.references) || r.references.length > 30) fail('Use at most 30 image references.');
  const references = r.references.map(v => { const x = obj(v, ['assetId','sourceUrl','provenance','rights','role','usage','review'], 'reference');
    let review: AgentBrief['references'][number]['review'];
    if (x.review !== undefined) {
      const assessment = obj(x.review, ['sha256','method','reviewer','locationMatch','viewpointMatch','usable','observations'], 'vision review');
      if (assessment.method !== 'vision' || !/^[a-f0-9]{64}$/.test(String(assessment.sha256))) fail('A supplied vision review must include the actual image SHA256.');
      for (const k of ['locationMatch','viewpointMatch','usable']) if (typeof assessment[k] !== 'boolean') fail('Invalid vision assessment.');
      review = { sha256: assessment.sha256 as string, method: 'vision', reviewer: str(assessment.reviewer, 'reviewer', 200),
        locationMatch: assessment.locationMatch as boolean, viewpointMatch: assessment.viewpointMatch as boolean, usable: assessment.usable as boolean,
        observations: str(assessment.observations, 'observations', 1500) };
    }
    const id = str(x.assetId, 'asset ID', 36); if (!/^[0-9a-f-]{36}$/i.test(id)) fail('Invalid asset ID.');
    const sourceUrl = x.sourceUrl === undefined ? undefined : https(x.sourceUrl);
    const provenance = x.provenance === undefined ? undefined : str(x.provenance, 'provenance', 1000);
    const rights = x.rights === undefined ? undefined : str(x.rights, 'reference rights', 500);
    return { assetId: id, ...(sourceUrl ? { sourceUrl } : {}), ...(provenance ? { provenance } : {}), ...(rights ? { rights } : {}),
      role: str(x.role, 'reference role', 300), usage: choice(x.usage, ['location','subject','product','style'], 'reference usage'), ...(review ? { review } : {}) }; });
  if (new Set(references.map(x => x.assetId)).size !== references.length) fail('Choose distinct reference assets.');
  const kind = choice(s.kind, ['fictional','authorized'], 'subject kind');
  const permission = s.permission === undefined ? undefined : str(s.permission, 'permission', 1000);
  const importId = a.voiceoverImportId === undefined ? undefined : str(a.voiceoverImportId, 'voiceover import ID', 64);
  if (importId && !/^[a-f0-9]{64}$/.test(importId)) fail('Invalid voiceover import ID.');
  const referenceAssetId = a.referenceAssetId === undefined ? undefined : str(a.referenceAssetId, 'published audio asset ID', 36);
  if (referenceAssetId && !/^[0-9a-f-]{36}$/i.test(referenceAssetId)) fail('Invalid published audio asset ID.');
  return { schemaVersion: 1, request: str(r.request, 'request', 12000),
    format: { aspectRatio: choice(f.aspectRatio, ['9:16','16:9','1:1'], 'aspect ratio'), resolution: choice(f.resolution, ['480p','720p'], 'resolution') },
    subject: { kind, description: str(s.description, 'subject'), ...(permission ? { permission } : {}) },
    location: { name: str(l.name, 'location', 500), viewpoint: str(l.viewpoint, 'viewpoint', 1000), minimumReferences: l.minimumReferences as number },
    dialogue: { text: str(d.text, 'dialogue', 12000, true), language: str(d.language, 'language', 80), delivery: str(d.delivery, 'delivery', 1000) },
    audio: { mode: choice(a.mode, ['native','reference','original','silent'], 'audio mode'), ...(acoustics ? { acoustics } : {}), ...(importId ? { voiceoverImportId: importId } : {}), ...(referenceAssetId ? { referenceAssetId } : {}), ...(a.soundscape === undefined ? {} : { soundscape: str(a.soundscape, 'soundscape', 1000) }) },
    ...(r.finishing === undefined ? {} : { finishing: str(r.finishing, 'finishing', 1000) }), scenes, references };
}

// Optional reviews are evidence, not approvals. Provider APIs enforce their own requirements.
export function compileAgentBrief(brief: AgentBrief, origin = 'http://127.0.0.1:3000'): AgentPackage {
  const id = createHash('sha256').update(JSON.stringify(brief)).digest('hex');
  const blockers: string[] = [], refs: VideoReference[] = [];
  const warnings: string[] = [];
  if (brief.audio.acoustics && ['native','reference'].includes(brief.audio.mode)) warnings.push(...sceneAudioWarnings(brief.audio.acoustics,brief.audio.mode==='reference'));
  if (brief.audio.mode === 'reference') warnings.push('Reference audio is voice/timing guidance; original audio preservation and exact lip sync are not live-verified.');
  if (['silent','original'].includes(brief.audio.mode) && brief.audio.soundscape) warnings.push('This workflow uses silent model visuals; any extra sound design requires an explicit local editing stage. It is not sent as generated audio.');
  if (brief.dialogue.text && ['native','reference'].includes(brief.audio.mode) && !speechLanguageEvidence(brief.dialogue.language).documented) warnings.push(`${brief.dialogue.language} is not in the documented 11-language native-speech list. Treat this language as an unverified attempt and check pronunciation, transcript and lip sync.`);
  let usableLocation = 0; const hashes = new Set<string>();
  for (const r of brief.references) {
    try {
      const asset = readAsset(r.assetId), hash = createHash('sha256').update(fs.readFileSync(assetPath(asset))).digest('hex');
      if (asset.kind !== 'image') throw new Error('Use an image for a location reference.');
      if (r.review && hash !== r.review.sha256) throw new Error('Image changed after its vision review.');
      if (hashes.has(hash)) throw new Error('Duplicate image content does not count as another reference.'); hashes.add(hash);
      if (r.review && (!r.review.usable || (r.usage === 'location' && !r.review.locationMatch))) warnings.push(`${r.assetId}: the recorded review flags a reference mismatch.`);
      if (r.usage === 'location') usableLocation++;
      if (!asset.url) throw new Error('Upload the reference for model use.');
      refs.push({ ...asset, purpose: r.role });
    } catch (e) { blockers.push(`${r.assetId}: ${e instanceof Error ? e.message : 'Reference unavailable.'}`); }
  }
  if (usableLocation < brief.location.minimumReferences) blockers.push(`Include at least ${brief.location.minimumReferences} distinct images assigned to ${brief.location.name}.`);
  if (brief.location.minimumReferences > 0 && !brief.references.some(r => r.usage === 'location' && r.review?.usable && r.review.locationMatch && r.review.viewpointMatch)) warnings.push('The requested camera viewpoint has no recorded visual review.');
  const plan = newAdPlan();
  if(brief.audio.acoustics) plan.acoustics=brief.audio.acoustics;
  Object.assign(plan, { product: `${brief.subject.description}\nLocation: ${brief.location.name}. ${brief.location.viewpoint}`, audience: brief.request,
    aspectRatio: brief.format.aspectRatio, resolution: brief.format.resolution, language: brief.dialogue.language,
    audioMode: brief.audio.mode === 'native' ? 'generated' : brief.audio.mode, references: refs,
    scenes: brief.scenes.map((s, i) => ({ id: `scene-${i + 1}`, duration: s.duration, visual: s.action, camera: s.camera, narration: brief.scenes.length === 1 ? brief.dialogue.text : '', caption: s.caption ?? '', trimStart: 0 })) });
  if (brief.audio.mode === 'reference' || brief.audio.mode === 'original') {
    if (!brief.audio.voiceoverImportId) blockers.push('A completed Voiceovers import is required for the requested audio workflow.');
    else try {
      const imported = readVoiceoverImport(brief.audio.voiceoverImportId, origin);
      if (imported.manifest.text !== brief.dialogue.text) blockers.push('The approved transcript must match the imported voiceover exactly. Transcribe a prepared recording first.');
      const total = brief.scenes.reduce((sum, s) => sum + s.duration, 0);
      if (Math.abs(total - imported.asset.duration) > .05) blockers.push('Match the timeline to the measured voiceover length; do not stretch speech automatically.');
      plan.voiceAssetId = imported.asset.assetId; plan.voiceDuration = imported.asset.duration; plan.voiceName = imported.manifest.sourceJobId;
      if (brief.audio.mode === 'reference') {
        const localVoice = readAsset(imported.asset.assetId);
        const voice = brief.audio.referenceAssetId ? readAsset(brief.audio.referenceAssetId) : localVoice;
        if (voice.kind !== 'audio' || Math.abs((voice.duration ?? 0) - imported.asset.duration) > .01 ||
          !createHash('sha256').update(fs.readFileSync(assetPath(voice))).digest().equals(createHash('sha256').update(fs.readFileSync(assetPath(localVoice))).digest())) {
          throw new Error('Published audio differs from the approved recording.');
        }
        if (!voice.url) blockers.push('Publish the completed dialogue WAV explicitly as an audio reference. Enrollment/consent samples must never be sent to the video model.');
        else { plan.voiceReferenceAssetId = voice.assetId; refs.push({ ...voice, purpose: 'Complete approved dialogue; voice, delivery and timing.' }); }
      }
    } catch { blockers.push('The completed voiceover import is unavailable.'); }
  }
  if (brief.audio.mode === 'native' && !brief.dialogue.text && !brief.audio.soundscape) blockers.push('Supply exact spoken words or a non-speaking soundscape for native audio, or choose silent video.');
  if (brief.audio.mode === 'reference' && !brief.dialogue.text) blockers.push('The v1 reference mode requires a dialogue transcript. Use Studio for music-only or non-speech audio references.');
  try { validateReferences(refs, 'references'); } catch (e) { blockers.push((e as Error).message); }
  let t = 0; const shots = brief.scenes.map(s => { const start = t; t += s.duration; return `[${start}–${t}s] ${s.action} Camera: ${s.camera}`; });
  const audioLabel = refs.findIndex(r => r.kind === 'audio');
  const audioDesign = brief.audio.acoustics
    ? sceneAudioDirection(brief.audio.acoustics, brief.audio.mode === 'reference') + (brief.audio.soundscape ? `\nADDITIONAL SOUND DIRECTION: ${brief.audio.soundscape}` : '\nNo unrequested music or additional voices.')
    : brief.audio.soundscape ?? (brief.audio.mode === 'reference' ? REFERENCE_AUDIO_DESIGN : 'Natural scene tone appropriate to the visible location; no music or additional voices. Keep dialogue clearly audible.');
  const prompt = withReferenceRoles([
    `Create a ${generationDuration(plan)}-second ${brief.format.aspectRatio} video.`,
    `BRIEF: ${brief.request}`, `SUBJECT: ${brief.subject.description}`,
    brief.audio.mode === 'reference' ? `AUDIO POLICY: ${audioDesign}` : '',
    `LOCATION AND VIEWPOINT: ${brief.location.name}. ${brief.location.viewpoint}. Copy architecture and geography only from the assigned reference roles; do not merge contradictory viewpoints.`,
    'CONTINUITY: Keep the same speaker, clothing, location, lighting and props. Believable skin and physical movement. Use the camera movement specified per shot.', ...shots,
    brief.audio.mode === 'silent' ? 'AUDIO: Silent video. Render the requested visual actions without generated audio.' : brief.audio.mode === 'original' ? 'AUDIO: Silent non-speaking footage. Approved voiceover will be added locally in editing; do not attempt visible lip sync to an unprovided recording.' : !brief.dialogue.text ? 'AUDIO: Generate only the requested non-speaking soundscape. No intelligible dialogue or invented narration.' :
      `DIALOGUE (${brief.dialogue.language}, verbatim): {${JSON.stringify(brief.dialogue.text)}}. DELIVERY: ${brief.dialogue.delivery}. ${brief.audio.mode === 'reference' && audioLabel >= 0 ? referenceSpeechDirection(referenceLabel(refs, audioLabel, 'references')) : 'Generate consistent original voices for the described speakers with synchronized visible speech. Preserve each speaker assignment across shots.'} No unrequested translation, extra words or competing voices. Keep speaking faces clearly visible and unoccluded when mouth alignment is required.`,
    ['native','reference'].includes(brief.audio.mode) ? `AUDIO DESIGN: ${audioDesign}` : '',
    `FINISH: ${brief.finishing ?? 'Preserve the requested visual style; no extra text or unrequested logos.'} Do not invent news attribution or present this synthetic scene as evidence of a real interview or endorsement.`,
    brief.scenes.some(s => s.caption) ? 'EDITING CAPTIONS: Scene captions will be added deterministically in local editing. Do not bake them into the model video.' : '',
    t < generationDuration(plan) ? `Hold the ending until ${generationDuration(plan)}s; trim the visual tail to ${t}s in editing.` : '',
  ].filter(Boolean).join('\n\n'), refs);
  const request = { modelId: 'openrouter:bytedance/seedance-2.5', prompt, params: { duration: generationDuration(plan), resolution: brief.format.resolution,
    aspect_ratio: brief.format.aspectRatio, generate_audio: brief.audio.mode === 'native' || brief.audio.mode === 'reference' }, references: refs, referenceMode: 'references', batch: 1 };
  if (!blockers.length) try { parseGenerationRequest(request); } catch (e) { blockers.push((e as Error).message); }
  return { schemaVersion: 1, id, brief, status: blockers.length ? 'blocked' : 'ready', blockers, warnings, prompt, generationRequest: blockers.length ? null : request,
    adPlan: plan, compositionUrl: `${origin}/ads?agentPlan=${id}`, generationStarted: false,
    capabilities: { referenceAudio: 'experimental', exactLipSync: false, vision: 'optional-external-agent-review' } };
}
export function saveAgentBrief(brief: AgentBrief, origin: string) {
  const result = compileAgentBrief(brief, origin); fs.mkdirSync(AGENT_DIR, { recursive: true });
  const file = path.join(AGENT_DIR, `${result.id}.json`);
  try { fs.writeFileSync(file, JSON.stringify(brief), { flag: 'wx' }); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
  return result;
}
export function getAgentPackage(id: string, origin: string) {
  if (!/^[a-f0-9]{64}$/.test(id)) fail('Invalid plan ID.');
  try { return compileAgentBrief(parseAgentBrief(JSON.parse(fs.readFileSync(path.join(AGENT_DIR, `${id}.json`), 'utf8'))), origin); }
  catch (e) { if (e instanceof AgentError) throw e; throw new AgentError('Agent plan is unavailable.', 404); }
}
