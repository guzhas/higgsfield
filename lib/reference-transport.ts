import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { assetPath, readAsset } from './reference-assets';
import type { VideoReference } from './video-references';
import { isLocalAssetUrl } from './local-reference-id';
export { localAssetUrl, isLocalAssetUrl } from './local-reference-id';

export const localInlineReferences = () => process.env.STUDIO_REFERENCE_TRANSPORT !== 'higgsfield';
/** Report the observed provider response, without treating local encoding tests as acceptance. */
export function inlineAudioTransportIssue(): string | undefined {
  if (!localInlineReferences()) return;
  try {
    const diagnostic = JSON.parse(fs.readFileSync('storage/diagnostics/openrouter-video-rejection.json','utf8'));
    if (diagnostic.status === 400 && Array.isArray(diagnostic.messages) && diagnostic.messages.some((m:unknown)=>typeof m==='string' && /audio_url.*Only HTTPS URLs are allowed/i.test(m))) {
      return 'OpenRouter garso nuorodai reikalauja HTTPS adreso. Vietinis inline garso perdavimas realioje užklausoje atmestas; Higgsfield rakto tam nereikia.';
    }
  } catch { /* No recorded provider rejection. */ }
}
export interface InlineAssetBinding { url: string; sha256: string }
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

function localBytes(url: string, kind: string) {
  if (!isLocalAssetUrl(url)) throw new Error('Invalid local reference.');
  const asset = readAsset(url.slice('studio-asset:'.length));
  if (asset.kind !== kind || asset.url !== url) throw new Error('Local reference no longer matches its asset.');
  if (!['image/png','image/jpeg','image/webp','image/gif','audio/wav','audio/mpeg'].includes(asset.mime) || kind === 'video') throw new Error('Inline transport supports image and audio files only.');
  const file = assetPath(asset), limit = (kind === 'image' ? 30 : 15) * 1024 * 1024;
  const size = fs.statSync(file).size;
  if (!size || size > limit) throw new Error('Local reference exceeds the supported file size.');
  return { bytes: fs.readFileSync(file), mime: asset.mime };
}

export function bindInlineAssets(refs: VideoReference[]): InlineAssetBinding[] {
  return refs.filter(r => isLocalAssetUrl(r.url)).map(r => ({ url: r.url, sha256: hash(localBytes(r.url,r.kind).bytes) }));
}

// Resolve bytes only for the outgoing provider request. Stored plans/jobs retain
// local asset identifiers and content hashes, never large base64 strings.
export function inlineAssetUrl(url: string, kind: string, bindings: InlineAssetBinding[]): string {
  if (!isLocalAssetUrl(url)) return url;
  const binding = bindings.find(b => b.url === url);
  const {bytes,mime} = localBytes(url,kind);
  if (!binding || hash(bytes) !== binding.sha256) throw new Error('Local reference changed after preparation; prepare a new request.');
  return `data:${mime};base64,${bytes.toString('base64')}`;
}
