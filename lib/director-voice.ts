import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AgentError } from './agent-plans';
import { readAsset, assetPath, ASSET_DIR, saveAsset } from './reference-assets';
import { inspectMedia, runMediaTool } from './media-tools';

// Runtime-only; never return or persist this key. Restart clears it.
const runtimeState = globalThis as typeof globalThis & { studioElevenKey?: string };
export function elevenKey() { return runtimeState.studioElevenKey ?? process.env.ELEVENLABS_API_KEY?.trim() ?? ''; }
export function setElevenKey(key: string) {
  if (!key.trim() || key.length > 500) throw new AgentError('Įvesk ElevenLabs API raktą.');
  runtimeState.studioElevenKey = key.trim();
}
export async function elevenVoices() {
  const key = elevenKey(); if (!key) return { configured: false, voices: [] };
  const voices: { id: string; name: string; category: string; available: boolean; selectable: boolean; requiresVerification: boolean; isVerified: boolean }[] = []; let token = '';
  for (let page = 0; page < 10; page++) {
    const url = new URL('https://api.elevenlabs.io/v2/voices'); url.searchParams.set('page_size','100'); url.searchParams.set('voice_type','non-default'); if (token) url.searchParams.set('next_page_token', token);
    const res = await fetch(url, { headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(20000), redirect: 'error' });
    if (!res.ok) throw new AgentError(`ElevenLabs balsų sąrašas nepasiekiamas (${res.status}). Raktui reikia „Voices: Read“.`, 401);
    const body = await res.json();
    // Provider verification metadata is informational. The synthesis endpoint decides whether a voice can be used.
    for (const v of body.voices ?? []) voices.push({ id: String(v.voice_id), name: String(v.name), category: String(v.category),
      available: !v.voice_verification?.requires_verification || v.voice_verification?.is_verified === true, selectable: true,
      requiresVerification: v.voice_verification?.requires_verification === true, isVerified: v.voice_verification?.is_verified === true });
    if (!body.has_more) return { configured: true, voices };
    if (!body.next_page_token || body.next_page_token === token) throw new AgentError('Nepavyko nuskaityti visų balsų puslapių.', 502);
    token = body.next_page_token;
  }
  throw new AgentError('Per didelė balsų biblioteka. Naudok mažesnę ElevenLabs biblioteką.', 422);
}
export async function createDialogue(voiceId: string, text: string, language: string) {
  if (!/^[A-Za-z0-9_-]{5,100}$/.test(voiceId)) throw new AgentError('Pasirink klonuotą balsą.');
  if (!text || text.length > 450) throw new AgentError('Šiam trumpam video naudok iki 450 teksto simbolių.');
  const library = await elevenVoices();
  if (!library.voices.some(v=>v.id === voiceId)) throw new AgentError('Pasirinkto balso nėra šioje ElevenLabs paskyroje.', 422);
  let res: Response;
  try {
    res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=pcm_24000`, {
      method: 'POST', headers: { 'xi-api-key': elevenKey(), 'Content-Type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(110000),
      // v3 has no Similarity/Speaker Boost control. Do not imply either fixes source acoustics.
      body: JSON.stringify({ text, model_id: 'eleven_v3', language_code: language, voice_settings: { stability: 0.5 } }),
    });
  } catch { throw new AgentError('Įgarsinimo užklausos baigtis nežinoma. Automatiškai nekartojame; patikrink ElevenLabs istoriją.', 502); }
  if (!res.ok) {
    let verificationRequired = false;
    try { const body = await res.json(); verificationRequired = /verif/i.test(String(body?.detail?.status ?? '')); } catch {}
    throw new AgentError(verificationRequired
      ? `ElevenLabs įgarsinimo API reikalauja balso patvirtinimo (${res.status}). Tai tiekėjo atsakymas; projektas papildomo patvirtinimo nereikalauja.`
      : `ElevenLabs įgarsinimą atmetė (${res.status}). Patikrink TTS teises ir kreditus.`, 502);
  }
  const pcm = Buffer.from(await res.arrayBuffer());
  if (pcm.length < 5 * 48000 || pcm.length > 30 * 48000 || pcm.length % 2) throw new AgentError('Gautas įgarsinimas netelpa į 5–30 sek. video. Koreguok tekstą; garso automatiškai negreitinsime.', 422);
  const wav = Buffer.alloc(44 + pcm.length); wav.write('RIFF'); wav.writeUInt32LE(wav.length-8,4); wav.write('WAVEfmt ',8); wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22); wav.writeUInt32LE(24000,24); wav.writeUInt32LE(48000,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(pcm.length,40); pcm.copy(wav,44);
  fs.mkdirSync(ASSET_DIR,{recursive:true}); const assetId = randomUUID(), filename = assetId+'.wav'; fs.writeFileSync(path.join(ASSET_DIR,filename), wav);
  const asset = { assetId, filename, kind: 'audio' as const, mime: 'audio/wav', url: '', localUrl: '/api/reference-assets/'+assetId, duration: pcm.length/48000, bytes: wav.length, name: 'Paruoštas įgarsinimas', hasAudio: true };
  saveAsset(asset); return asset;
}
export async function normalizeDialogue(assetId: string) {
  const source = readAsset(assetId);
  if (source.kind !== 'audio' || !source.duration || source.duration < 5 || source.duration > 30) throw new AgentError('Paruoštas įgarsinimas turi būti 5–30 sek. MP3 arba WAV.');
  const id = randomUUID(), filename = id+'.wav', target = path.join(ASSET_DIR,filename);
  await runMediaTool('ffmpeg',['-v','error','-nostdin','-protocol_whitelist','file,pipe','-i',assetPath(source),'-vn','-ac','1','-ar','24000','-c:a','pcm_s16le','-y',target]);
  const media = await inspectMedia(target);
  const asset = { assetId: id, filename, mime:'audio/wav',kind:'audio' as const,url:'',localUrl:'/api/reference-assets/'+id,bytes:fs.statSync(target).size,name:source.name,...media };
  saveAsset(asset); return asset;
}
