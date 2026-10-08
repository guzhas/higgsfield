import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { paidStage } from './voiceover.mjs';

const hash = buffer => createHash('sha256').update(buffer).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));

export function wavInfo(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Invalid WAV.');
  let rate, channels, byteRate, bits, dataOffset, dataBytes;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const size = buffer.readUInt32LE(offset + 4);
    if (offset + 8 + size > buffer.length) throw new Error('Truncated WAV.');
    const kind = buffer.toString('ascii', offset, offset + 4);
    if (kind === 'fmt ' && size >= 16) {
      if (buffer.readUInt16LE(offset + 8) !== 1) throw new Error('Expected PCM WAV.');
      channels = buffer.readUInt16LE(offset + 10); rate = buffer.readUInt32LE(offset + 12);
      byteRate = buffer.readUInt32LE(offset + 16); bits = buffer.readUInt16LE(offset + 22);
    }
    if (kind === 'data') { dataOffset = offset + 8; dataBytes = size; }
    offset += 8 + size + size % 2;
  }
  if (!byteRate || !rate || !channels || bits !== 16 || !dataBytes) throw new Error('Missing PCM audio.');
  let peak = 0;
  for (let offset = dataOffset; offset < dataOffset + dataBytes; offset += 2) peak = Math.max(peak, Math.abs(buffer.readInt16LE(offset)));
  return { seconds: dataBytes / byteRate, channels, rate, peak };
}

// Preserve the approved performance and ambience; only clean and reposition voice.
export async function outdoorVoiceover(source, directory, { key, ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg', fetchImpl = fetch } = {}) {
  if (!key?.trim()) throw new Error('An ElevenLabs runtime key is required.');
  if (path.resolve(source) === path.resolve(directory)) throw new Error('Keep the original recording in a separate directory.');
  const manifest = json(path.join(source, 'manifest.json'));
  if (manifest.status !== 'completed') throw new Error('Source voiceover is not completed.');
  const voice = fs.readFileSync(path.join(source, 'voice.wav'));
  const ambience = fs.readFileSync(path.join(source, 'ambience.mp3'));
  if (hash(voice) !== json(path.join(source, 'voice.json')).mediaSha256 || hash(ambience) !== json(path.join(source, 'ambience.json')).mediaSha256) throw new Error('Source audio integrity failed.');
  const durationSeconds = manifest.finalDurationSeconds;
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0.5 || durationSeconds > 30) throw new Error('Invalid source duration.');
  const run = args => execFileSync(ffmpeg, args, { windowsHide: true, timeout: 180000, maxBuffer: 2 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  run(['-version']);
  fs.mkdirSync(directory, { recursive: true });
  const lock = path.join(directory, '.outdoor.lock');
  const handle = fs.openSync(lock, 'wx');
  try {
    const sourceHash = hash(voice);
    const body = new FormData();
    body.append('audio', new Blob([voice], { type: 'audio/wav' }), 'voice.wav');
    body.append('file_format', 'other');
    const isolated = await paidStage({ directory, name: 'isolation', mediaName: 'isolated-voice.audio', key, fetchImpl,
      endpoint: '/v1/audio-isolation', payload: { sourceSha256: sourceHash, file_format: 'other' }, body });
    const cleanFile = path.join(directory, 'voice-clean.wav');
    run(['-hide_banner', '-loglevel', 'error', '-y', '-i', isolated.file, '-vn', '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', cleanFile]);
    const sourceInfo = wavInfo(voice);
    const cleanInfo = wavInfo(fs.readFileSync(cleanFile));
    if (Math.abs(sourceInfo.seconds - cleanInfo.seconds) > 0.15 || cleanInfo.peak === 0) throw new Error('Isolation changed duration or produced silence; review before mixing.');
    // Reduce close-microphone bass and boxy mids. No simulated room or echo.
    const eq = 'highpass=f=85,equalizer=f=340:t=q:w=1.1:g=-3,lowpass=f=10000';
    const measurement = spawnSync(ffmpeg, ['-hide_banner', '-i', cleanFile, '-af', `${eq},loudnorm=I=-19:TP=-2:LRA=50:print_format=json`, '-f', 'null', '-'],
      { windowsHide: true, timeout: 180000, maxBuffer: 2 * 1024 * 1024, encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });
    const statistics = measurement.stderr?.match(/\{\s*"input_i"[\s\S]*?\}/)?.[0];
    if (measurement.status !== 0 || !statistics) throw new Error('Could not measure voice loudness.');
    const inputLufs = Number(JSON.parse(statistics).input_i);
    if (!Number.isFinite(inputLufs)) throw new Error('Invalid measured voice loudness.');
    const voiceGainDb = -19 - inputLufs;
    // A fixed gain preserves the performance's natural dynamics. The API output
    // is only EQ'd here; peak limiting is applied after the final mix.
    const outdoorFile = path.join(directory, 'voice-outdoor.wav');
    run(['-hide_banner', '-loglevel', 'error', '-y', '-i', cleanFile, '-af', `${eq},volume=${voiceGainDb}dB`, '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', outdoorFile]);
    const ambienceFile = path.join(directory, 'ambience.mp3');
    fs.writeFileSync(ambienceFile, ambience);
    const mixFile = path.join(directory, 'mix.wav');
    const filters = `[0:a]apad[v];[1:a]loudnorm=I=${manifest.request.ambience.loudnessLufs}:TP=-5:LRA=7,afade=t=in:d=0.6,afade=t=out:st=${Math.max(0, durationSeconds - 1)}:d=1[a];[v][a]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95:level=false:latency=true,aresample=48000,apad,asetpts=N/SR/TB[out]`;
    run(['-hide_banner', '-loglevel', 'error', '-y', '-i', outdoorFile, '-stream_loop', '-1', '-i', ambienceFile, '-filter_complex', filters,
      '-map', '[out]', '-t', String(durationSeconds), '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', mixFile]);
    run(['-hide_banner', '-loglevel', 'error', '-y', '-i', mixFile, '-c:a', 'libmp3lame', '-b:a', '192k', path.join(directory, 'mix.mp3')]);
    const mixedInfo = wavInfo(fs.readFileSync(mixFile));
    if (Math.abs(mixedInfo.seconds - durationSeconds) > 0.01 || mixedInfo.peak >= 32767) throw new Error('Final mix failed duration/peak validation.');
    const evidence = { status: 'completed', source, sourceVoiceSha256: sourceHash, ambienceSha256: hash(ambience),
      voiceId: manifest.voiceId, originalText: manifest.request.originalText, correctedText: manifest.request.correctedText,
      processing: { provider: 'elevenlabs', endpoint: '/v1/audio-isolation', eq, voiceGainDb, voiceTargetLufs: -19, roomReverbAdded: false, ambienceRegenerated: false },
      sourceInfo, cleanInfo, mixedInfo, mixedSha256: hash(fs.readFileSync(mixFile)), review: 'not_listened', completedAt: new Date().toISOString() };
    fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(evidence, null, 2));
    return evidence;
  } finally { fs.closeSync(handle); fs.unlinkSync(lock); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [source, output] = process.argv.slice(2);
    if (!source || !output) throw new Error('Usage: npm run voiceover:outdoor -- source-directory storage/agent-work/output');
    for (const directory of [source, output]) {
      const relative = path.relative(path.resolve('storage'), path.resolve(directory));
      if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Use directories inside storage.');
    }
    const result = await outdoorVoiceover(path.resolve(source), path.resolve(output), { key: process.env.ELEVENLABS_API_KEY });
    console.log(JSON.stringify({ status: result.status, ...result.mixedInfo, file: path.resolve(output, 'mix.mp3'), ambienceRegenerated: false }));
  } catch (error) { console.error(error?.code ? 'Local outdoor audio processing failed.' : error.message); process.exitCode = 1; }
}
