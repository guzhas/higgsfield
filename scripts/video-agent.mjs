// Agent client: local HTTP only, never reads credentials or environment files.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const base = (process.env.VIDEO_AGENT_BASE_URL?.trim() || 'http://127.0.0.1:3000').replace(/\/$/, ''), voiceBase = 'http://127.0.0.1:3210';
const [command, ...args] = process.argv.slice(2);
const id = value => { if (!/^[a-f0-9]{64}$/.test(value ?? '')) throw new Error('Expected a 64-character plan/import ID.'); return value; };
const assetId = value => { if (!/^[0-9a-f-]{36}$/i.test(value ?? '')) throw new Error('Expected an asset/job UUID.'); return value; };
function fileJson(filename) { const bytes = fs.readFileSync(filename); if (bytes.length > 128 * 1024) throw new Error('JSON exceeds 128 KiB.'); return JSON.parse(bytes.toString('utf8')); }
async function http(url, options = {}) {
  const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(180000) });
  if (!response.ok) { let error; try { error = await response.json(); } catch {} throw new Error(error?.error ?? `Local service returned HTTP ${response.status}.`); }
  return response;
}
async function json(url, body, extraHeaders = {}) {
  return (await http(url, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Video-Agent': 'studio-v1', ...extraHeaders }, body: JSON.stringify(body) })).json();
}
function output(data) { process.stdout.write(JSON.stringify(data, null, 2) + '\n'); }
try {
  const studioUrl = new URL(base);
  if (studioUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(studioUrl.hostname) || studioUrl.username || studioUrl.password || studioUrl.pathname !== '/' || studioUrl.search || studioUrl.hash) throw new Error('VIDEO_AGENT_BASE_URL must be a loopback HTTP origin, for example http://127.0.0.1:3001.');
  if (command === 'capabilities') output(await json(base + '/api/agent/capabilities'));
  else if (command === 'prepare') {
    const result = await json(base + '/api/agent/plans', fileJson(args[0]));
    output({ id: result.id, status: result.status, blockers: result.blockers, warnings: result.warnings, compositionUrl: result.compositionUrl, generationStarted: false });
  } else if (command === 'inspect') {
    const pkg = await json(base + '/api/agent/plans/' + id(args[0]));
    if (!args[1]) throw new Error('Specify a local output JSON path; references are not printed to the console.');
    const target = path.resolve(args[1]); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, JSON.stringify(pkg, null, 2));
    output({ id: pkg.id, status: pkg.status, saved: target, blockers: pkg.blockers });
  } else if (command === 'submit') {
    const options = args[1] ? fileJson(args[1]) : {};
    output(await json(base + `/api/agent/plans/${id(args[0])}/generate`, options));
  } else if (command === 'status') output(await json(base + '/api/jobs/' + assetId(args[0])));
  else if (command === 'voices') {
    const type = args[0] ?? 'replicated'; if (!['replicated','prebuilt'].includes(type)) throw new Error('Choose replicated or prebuilt.');
    const result = await json(voiceBase + '/api/voices/list', { type }, { Origin: voiceBase });
    output({ voices: result.voices });
  } else if (command === 'speech') {
    if (!args[1]) throw new Error('Specify a local output WAV path. This command is billable.');
    const response = await http(voiceBase + '/api/speech', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: voiceBase, 'X-Request-Id': randomUUID() }, body: JSON.stringify(fileJson(args[0])) });
    if (!response.headers.get('content-type')?.startsWith('audio/wav')) throw new Error('Voiceovers did not return a WAV.');
    const bytes = Buffer.from(await response.arrayBuffer()); if (bytes.length > 15 * 1024 * 1024) throw new Error('Voiceover exceeds 15 MiB.');
    const target = path.resolve(args[1]); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes); output({ saved: target, bytes: bytes.length });
  } else if (command === 'import-voice') {
    const data = fs.readFileSync(args[0]); if (data.length > 15 * 1024 * 1024) throw new Error('WAV exceeds 15 MiB.');
    const form = new FormData(); form.set('file', new Blob([data], { type: 'audio/wav' }), 'voiceover.wav'); form.set('manifest', JSON.stringify(fileJson(args[1])));
    const result = await (await http(base + '/api/voiceover-import', { method: 'POST', headers: { 'X-Voiceover-Client': 'voiceovers-v1' }, body: form })).json();
    output({ importId: result.importId, assetId: result.asset.assetId, duration: result.asset.duration, compositionUrl: result.compositionUrl, generationStarted: false });
  } else if (command === 'upload-local' || command === 'publish') {
    let data, mime;
    if (command === 'publish') {
      const response = await http(base + '/api/reference-assets/' + assetId(args[0])); mime = response.headers.get('content-type')?.split(';')[0]; data = await response.arrayBuffer();
    } else {
      mime = args[1]; if (!mime) throw new Error('Specify the file MIME type.'); data = fs.readFileSync(args[0]);
    }
    const form = new FormData(); form.set('file', new Blob([data], { type: mime }), 'reference');
    if (command === 'upload-local') form.set('localOnly', '1'); else form.set('validateReferences', '1');
    const result = await (await http(base + '/api/upload', { method: 'POST', body: form })).json();
    output({ assetId: result.assetId, kind: result.kind, localUrl: result.localUrl, duration: result.duration, width: result.width, height: result.height, published: Boolean(result.url?.startsWith('https://')), localInline: Boolean(result.url?.startsWith('studio-asset:')) });
  } else throw new Error('Commands: capabilities | prepare brief.json | inspect planId output.json | submit planId [options.json] (billable) | status jobId | voices [replicated|prebuilt] | speech request.json output.wav (billable) | import-voice audio.wav manifest.json | upload-local file mime | publish assetId (external upload).');
} catch (e) { process.stderr.write((e instanceof Error ? e.message : 'Agent command failed.') + '\n'); process.exitCode = 1; }
