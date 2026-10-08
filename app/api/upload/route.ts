import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { HiggsfieldError, MissingCredentialsError, hasCredentials, uploadFile } from '@/lib/higgsfield';
import { ASSET_DIR, saveAsset, publicAsset, type ReferenceAsset } from '@/lib/reference-assets';
import { inspectMedia, runMediaTool } from '@/lib/media-tools';
import { validateReferences } from '@/lib/video-references';
import { assertAgentRequest } from '@/lib/agent-plans';
import { localInlineReferences, localAssetUrl } from '@/lib/reference-transport';

export const runtime = 'nodejs';
export const maxDuration = 180;
const TYPES: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mpeg': 'mp3',
};
function signature(bytes: Buffer, ext: string) {
  const head = bytes.subarray(0, 16);
  if (ext === 'jpg') return head[0] === 255 && head[1] === 216;
  if (ext === 'png') return head.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (ext === 'gif') return /^GIF8[79]a/.test(head.toString('ascii'));
  if (ext === 'webp' || ext === 'wav') return head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === (ext === 'wav' ? 'WAVE' : 'WEBP');
  if (ext === 'mp3') return head.toString('ascii', 0, 3) === 'ID3' || (head[0] === 255 && (head[1] & 224) === 224);
  return ['ftyp', 'moov', 'mdat', 'wide'].includes(head.toString('ascii', 4, 8));
}

export async function POST(req: Request) {
  const created: string[] = [];
  try {
    const form = await req.formData(); const file = form.get('file');
    const inline = localInlineReferences();
    const localOnly = form.get('localOnly') === '1' || inline;
    const normalizeReference = form.get('normalizeReference') === '1';
    if (normalizeReference) assertAgentRequest(req, true);
    if (!(file instanceof File)) return Response.json({ error: 'Choose a file.' }, { status: 400 });
    const ext = TYPES[file.type];
    if (!ext) return Response.json({ error: 'Use JPG, PNG, WebP, GIF, MP4, MOV, WAV or MP3.' }, { status: 400 });
    const kind = file.type.split('/')[0] as 'image' | 'video' | 'audio';
    const max = (kind === 'audio' ? 15 : kind === 'image' ? 30 : 200) * 1024 * 1024;
    if (!file.size || file.size > max) return Response.json({ error: `${kind} files must be smaller than ${max / 1024 / 1024} MB.` }, { status: 400 });
    if (!localOnly && !hasCredentials()) throw new MissingCredentialsError();
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!signature(bytes, ext)) return Response.json({ error: 'The file content does not match its format.' }, { status: 400 });
    fs.mkdirSync(ASSET_DIR, { recursive: true });
    const id = randomUUID(); let filename = `${id}.${ext}`; let target = path.join(ASSET_DIR, filename);
    fs.writeFileSync(target, bytes); created.push(target);
    let info = await inspectMedia(target);
    let imageMime = file.type;
    if (kind === 'image' && normalizeReference) {
      if (!info.width || !info.height) throw new Error('Nepavyko nustatyti nuotraukos matmenų.');
      const scale = Math.min(6000 / Math.max(info.width, info.height), Math.max(1, 300 / Math.min(info.width, info.height)));
      const w = Math.max(1, Math.round(info.width * scale)), h = Math.max(1, Math.round(info.height * scale));
      const pw = Math.max(300, w, Math.ceil(h * 0.4)), ph = Math.max(300, h, Math.ceil(w / 2.5));
      if (pw !== info.width || ph !== info.height || w !== info.width || h !== info.height || ext === 'gif') {
        filename = `${id}.png`; const normalized = path.join(ASSET_DIR, `${id}.normalized.png`);
        // A geometry-only conversion: preserve the whole image, no face analysis or crop.
        created.push(normalized);
        await runMediaTool('ffmpeg', ['-v','error','-nostdin','-protocol_whitelist','file,pipe','-i',target,'-frames:v','1','-vf',`scale=${w}:${h},pad=${pw}:${ph}:(ow-iw)/2:(oh-ih)/2:black`,'-y',normalized]);
        fs.unlinkSync(target); target = path.join(ASSET_DIR, filename); fs.renameSync(normalized, target); created.push(target); info = await inspectMedia(target); imageMime = 'image/png';
      }
    }
    if (kind === 'audio' && !info.hasAudio || kind !== 'audio' && !info.hasVideo) throw new Error('This file does not contain the expected media.');
    if (kind !== 'image' && (!info.duration || info.duration > 300)) throw new Error('Choose a media file with a duration up to 5 minutes.');
    if (ext === 'mp3' || ext === 'mov') {
      filename = `${id}.${ext === 'mp3' ? 'wav' : 'mp4'}`; const converted = path.join(ASSET_DIR, filename); created.push(converted);
      await runMediaTool('ffmpeg', ['-v', 'error', '-nostdin', '-protocol_whitelist', 'file,pipe', '-i', target, ...(ext === 'mp3' ? ['-vn', '-c:a', 'pcm_s16le'] : ['-map','0:v:0','-map','0:a?','-c:v','libx264','-preset','fast','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart']), '-y', converted]);
      fs.unlinkSync(target); target = converted; info = await inspectMedia(target);
    }
    const mime = kind === 'audio' ? 'audio/wav' : kind === 'video' ? 'video/mp4' : imageMime;
    const asset: ReferenceAsset = { assetId: id, url: '', localUrl: `/api/reference-assets/${id}`, filename, mime, kind, name: file.name.slice(0,120), bytes: fs.statSync(target).size, ...info };
    if (!localOnly && form.get('validateReferences') === '1') validateReferences([{ ...asset, url: 'https://upload.example/asset' }], 'references');
    if (!localOnly) asset.url = await uploadFile(Uint8Array.from(fs.readFileSync(target)).buffer, mime);
    if (inline) asset.url=localAssetUrl(asset.assetId);
    saveAsset(asset);
    return Response.json(publicAsset(asset));
  } catch (error) {
    for (const file of created) { try { fs.unlinkSync(file); } catch {} }
    if (error instanceof MissingCredentialsError) return Response.json({ error: 'Reference uploads use Higgsfield storage. Add its key in Settings. Local voiceover and editing files do not require a key.' }, { status: 401 });
    if (error instanceof HiggsfieldError) return Response.json({ error: 'The reference could not be uploaded to Higgsfield storage.' }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : 'Upload failed.' }, { status: 400 });
  }
}
