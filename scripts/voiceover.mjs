import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const hash = value => createHash('sha256').update(value).digest('hex');
const writeJson = (file, value) => {
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2));
  fs.renameSync(temporary, file);
};
const bounded = (value, fallback, min, max) => {
  const number = value ?? fallback;
  if (typeof number !== 'number' || !Number.isFinite(number) || number < min || number > max) throw new Error('Audio setting outside its supported range.');
  return number;
};
const text = (value, max) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('Missing or oversized text.');
  return value.trim();
};

export function validateRequest(input) {
  if (!input || !/^[A-Za-z0-9_-]{1,80}$/.test(input.voiceId)) throw new Error('Invalid voice ID.');
  if (!['lt', 'en'].includes(input.language)) throw new Error('Choose lt or en speech.');
  const correctedText = text(input.text, 1000);
  return {
    voiceId: input.voiceId, language: input.language,
    originalText: text(input.originalText ?? correctedText, 1000), correctedText,
    synthesisText: text(input.synthesisText ?? correctedText, 1500),
    voiceSettings: {
      stability: bounded(input.stability, 0.5, 0, 1),
      speed: bounded(input.speed, 0.9, 0.7, 1.2),
    },
    ignoredSettings: input.similarityBoost === undefined ? [] : ['similarityBoost: unsupported on eleven_v3'],
    targetSeconds: bounded(input.targetSeconds, 20, 0.5, 30),
    ambience: input.ambience ? {
      prompt: text(input.ambience.prompt, 1000),
      durationSeconds: bounded(input.ambience.durationSeconds, 20, 0.5, 30),
      loudnessLufs: bounded(input.ambience.loudnessLufs, -34, -45, -24),
    } : null,
  };
}

export function pcmToWav(pcm) {
  if (!pcm.length || pcm.length % 2 || pcm.length > 30 * 48000) throw new Error('Speech must be valid PCM and at most 30 seconds.');
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(pcm.length, 40); pcm.copy(wav, 44);
  return wav;
}

// A stage is submitted once. Unknown/rejected outcomes require explicit review,
// including when a process died after submission. Finished media can be remixed locally.
export async function paidStage({ directory, name, payload, endpoint, key, fetchImpl = fetch, convert = value => value, body, mediaName }) {
  const ledgerFile = path.join(directory, `${name}.json`);
  if (mediaName && !/^[a-z0-9_-]+\.[a-z0-9]+$/i.test(mediaName)) throw new Error('Invalid media filename.');
  const mediaFile = path.join(directory, mediaName ?? (name === 'voice' ? 'voice.wav' : 'ambience.mp3'));
  const requestHash = hash(JSON.stringify({ endpoint, payload }));
  if (fs.existsSync(ledgerFile)) {
    const ledger = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
    if (ledger.requestHash !== requestHash) throw new Error('Changed request: use a new output directory.');
    if (ledger.status !== 'completed' || !fs.existsSync(mediaFile) || hash(fs.readFileSync(mediaFile)) !== ledger.mediaSha256) {
      throw new Error('Previous paid outcome needs review. Check ElevenLabs history; no automatic retry.');
    }
    return { ...ledger, file: mediaFile };
  }
  const ledger = { status: 'submitting', requestHash, payload, startedAt: new Date().toISOString(), automaticRetry: false };
  fs.writeFileSync(ledgerFile, JSON.stringify(ledger, null, 2), { flag: 'wx' });
  try {
    const response = await fetchImpl(`https://api.elevenlabs.io${endpoint}`, {
      method: 'POST', headers: { 'xi-api-key': key, ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
      body: body ?? JSON.stringify(payload), redirect: 'error', signal: AbortSignal.timeout(110000),
    });
    if (!response.ok) {
      let providerCode;
      try {
        const value = (await response.json())?.detail?.status;
        if (typeof value === 'string' && /^[a-z_]{1,80}$/.test(value)) providerCode = value;
      } catch { /* Never save raw provider bodies or echoed credentials. */ }
      writeJson(ledgerFile, { ...ledger, status: 'rejected', httpStatus: response.status, ...(providerCode ? { providerCode } : {}) });
      throw new Error(`ElevenLabs rejected ${name} (HTTP ${response.status}).`);
    }
    const source = Buffer.from(await response.arrayBuffer());
    if (!source.length || source.length > 10 * 1024 * 1024) throw new Error('Invalid audio response.');
    const media = convert(source);
    fs.writeFileSync(mediaFile, media, { flag: 'wx' });
    const result = { ...ledger, status: 'completed', mediaSha256: hash(media), bytes: media.length,
      requestId: response.headers.get('request-id') ?? response.headers.get('x-request-id'),
      historyItemId: response.headers.get('history-item-id'), characterCost: response.headers.get('character-cost'), contentType: response.headers.get('content-type'),
      completedAt: new Date().toISOString() };
    writeJson(ledgerFile, result);
    return { ...result, file: mediaFile };
  } catch {
    const latest = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
    if (latest.status === 'submitting') writeJson(ledgerFile, { ...ledger, status: 'unknown' });
    throw new Error(`ElevenLabs ${name} did not complete locally. Inspect ${name}.json and provider history before a new request.`);
  }
}

export async function createVoiceover(input, directory, { key, ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg' } = {}) {
  const request = validateRequest(input);
  if (!key?.trim()) throw new Error('Set an ElevenLabs runtime key.');
  const mediaTool = args => execFileSync(ffmpeg, args, { windowsHide: true, timeout: 180000, maxBuffer: 2 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  mediaTool(['-version']); // Fail before spending if local mixing is unavailable.
  fs.mkdirSync(directory, { recursive: true });
  const lock = path.join(directory, '.voiceover.lock');
  const handle = fs.openSync(lock, 'wx');
  try {
    const requestFile = path.join(directory, 'request.json');
    if (fs.existsSync(requestFile) && hash(fs.readFileSync(requestFile)) !== hash(JSON.stringify(request, null, 2))) throw new Error('Changed request: use a new output directory.');
    if (!fs.existsSync(requestFile)) fs.writeFileSync(requestFile, JSON.stringify(request, null, 2), { flag: 'wx' });
    fs.writeFileSync(path.join(directory, 'script.txt'), request.correctedText + '\n');
    const voice = await paidStage({ directory, name: 'voice', key,
      endpoint: `/v1/text-to-speech/${request.voiceId}?output_format=pcm_24000`, convert: pcmToWav,
      payload: { text: request.synthesisText, model_id: 'eleven_v3', language_code: request.language, voice_settings: request.voiceSettings } });
    const durationSeconds = (voice.bytes - 44) / 48000;
    const finalDurationSeconds = Math.max(request.targetSeconds, durationSeconds);
    let ambience;
    if (request.ambience) ambience = await paidStage({ directory, name: 'ambience', key,
      endpoint: '/v1/sound-generation?output_format=mp3_44100_128',
      payload: { text: request.ambience.prompt, model_id: 'eleven_text_to_sound_v2', loop: true,
        duration_seconds: request.ambience.durationSeconds, prompt_influence: 0.6 } });
    const wavFile = path.join(directory, 'mix.wav');
    const voiceFilter = '[0:a]loudnorm=I=-16:TP=-2:LRA=7,apad[v]';
    const filters = ambience
      ? `${voiceFilter};[1:a]loudnorm=I=${request.ambience.loudnessLufs}:TP=-5:LRA=7,afade=t=in:d=0.6,afade=t=out:st=${Math.max(0, finalDurationSeconds - 1)}:d=1[a];[v][a]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95:level=false:latency=true,aresample=48000,apad,asetpts=N/SR/TB[out]`
      : `${voiceFilter};[v]alimiter=limit=0.95:level=false:latency=true,aresample=48000,apad,asetpts=N/SR/TB[out]`;
    mediaTool(['-hide_banner', '-loglevel', 'error', '-y', '-i', voice.file,
      ...(ambience ? ['-stream_loop', '-1', '-i', ambience.file] : []),
      '-filter_complex', filters, '-map', '[out]', '-t', String(finalDurationSeconds), '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', wavFile]);
    for (const name of ['mix', 'voice']) mediaTool(['-hide_banner', '-loglevel', 'error', '-y', '-i', path.join(directory, `${name}.wav`), '-c:a', 'libmp3lame', '-b:a', '192k', path.join(directory, `${name}.mp3`)]);
    const result = { status: 'completed', provider: 'elevenlabs', voiceId: request.voiceId, request,
      durationSeconds, finalDurationSeconds, files: { wav: wavFile, mp3: path.join(directory, 'mix.mp3'), voice: voice.file, ambience: ambience?.file },
      mixedSha256: hash(fs.readFileSync(wavFile)), review: 'not_listened', roomReverbAdded: false, completedAt: new Date().toISOString() };
    writeJson(path.join(directory, 'manifest.json'), result);
    return result;
  } finally {
    fs.closeSync(handle); fs.unlinkSync(lock);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [requestFile, output] = process.argv.slice(2);
    if (!requestFile || !output) throw new Error('Usage: npm run voiceover -- request.json storage/agent-work/output');
    const directory = path.resolve(output);
    const relative = path.relative(path.resolve('storage'), directory);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Choose an output directory inside storage.');
    const result = await createVoiceover(JSON.parse(fs.readFileSync(requestFile, 'utf8')), directory, { key: process.env.ELEVENLABS_API_KEY });
    console.log(JSON.stringify({ status: result.status, durationSeconds: result.durationSeconds, finalDurationSeconds: result.finalDurationSeconds, files: result.files }));
  } catch (error) {
    // Provider bodies and subprocess output may contain sensitive data: omit them.
    console.error(error?.code ? 'Local audio processing failed. Check FFmpeg and output files.' : error.message);
    process.exitCode = 1;
  }
}
