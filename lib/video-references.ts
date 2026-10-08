export type ReferenceKind = 'image' | 'video' | 'audio';
import { isLocalAssetUrl, localAssetUrl } from './local-reference-id';
export type ReferenceMode = 'references' | 'frames';
export interface VideoReference {
  url: string;
  kind: ReferenceKind;
  name?: string;
  purpose?: string;
  assetId?: string;
  duration?: number;
  width?: number;
  height?: number;
  bytes?: number;
  frameRate?: number;
}

export function referenceLabel(refs: VideoReference[], index: number, mode: ReferenceMode): string {
  if (mode === 'frames') return index === 0 ? 'First frame' : 'Last frame';
  const kind = refs[index].kind;
  const number = refs.slice(0, index + 1).filter(r => r.kind === kind).length;
  return `@${kind[0].toUpperCase() + kind.slice(1)}${number}`;
}

export function validateReferences(refs: VideoReference[], mode: ReferenceMode): void {
  if (!Array.isArray(refs) || refs.length > 50) throw new Error('Use at most 50 reference assets.');
  for (const r of refs) {
    if (!r || !['image', 'video', 'audio'].includes(r.kind) || typeof r.url !== 'string') throw new Error('Invalid reference asset.');
    if (isLocalAssetUrl(r.url)) {
      if (!r.assetId || r.url !== localAssetUrl(r.assetId)) throw new Error('Local references must match an uploaded asset ID.');
    } else {
      let url: URL;
      try { url = new URL(r.url); } catch { throw new Error('References need an uploaded local asset or a public HTTPS file URL.'); }
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('References need an uploaded local asset or a public HTTPS file URL.');
    }
    if (r.purpose && (typeof r.purpose !== 'string' || r.purpose.length > 300)) throw new Error('Keep each reference role under 300 characters.');
    if (r.kind !== 'image' && (!Number.isFinite(r.duration) || r.duration! < 2 || r.duration! > 30)) throw new Error('Audio and video references must be 2–30 seconds long. Upload the file to check its duration.');
    if (r.kind === 'video' && r.frameRate !== undefined && (!Number.isFinite(r.frameRate) || r.frameRate < 24 || r.frameRate > 60)) throw new Error('Video references need a frame rate between 24 and 60 fps.');
    if (r.bytes !== undefined && (!Number.isFinite(r.bytes) || r.bytes <= 0 || r.bytes > (r.kind === 'audio' ? 15 : r.kind === 'image' ? 30 : 200) * 1024 * 1024)) throw new Error(`The ${r.kind} reference exceeds the supported file size.`);
    if (r.kind === 'image' && (r.width !== undefined || r.height !== undefined) && (!Number.isFinite(r.width) || !Number.isFinite(r.height) || r.width! < 300 || r.height! < 300 || r.width! > 6000 || r.height! > 6000 || r.width! / r.height! < 0.4 || r.width! / r.height! > 2.5)) throw new Error('Reference images need 300–6000 px sides and an aspect ratio between 0.4 and 2.5.');
  }
  if (mode === 'frames') {
    if (refs.length > 2 || refs.some(r => r.kind !== 'image')) throw new Error('First/last frame mode accepts up to two images. Use References for audio or video.');
    if (refs.length === 2 && refs.every(r => r.width && r.height) && Math.abs(refs[0].width! / refs[0].height! - refs[1].width! / refs[1].height!) > 0.02) throw new Error('Prepare the first and last frame with the same aspect ratio.');
  } else {
    for (const kind of ['image', 'video', 'audio'] as const) {
      const assets = refs.filter(r => r.kind === kind);
      if (assets.length > (kind === 'image' ? 30 : 10)) throw new Error(`Too many ${kind} references.`);
      if (kind !== 'image' && assets.reduce((sum, r) => sum + r.duration!, 0) > 30.05) throw new Error(`Combined ${kind} reference duration must not exceed 30 seconds.`);
    }
  }
}

export function withReferenceRoles(prompt: string, refs: VideoReference[]): string {
  prompt = stripReferenceRoles(prompt);
  const roles = refs.flatMap((r, i) => r.purpose?.trim() ? [`${referenceLabel(refs, i, 'references')}: ${r.purpose.trim()}`] : []);
  return roles.length ? `REFERENCE ROLES\n${roles.join('\n')}\n\n${prompt}` : prompt;
}

export function stripReferenceRoles(prompt: string): string {
  return prompt.startsWith('REFERENCE ROLES\n') && prompt.includes('\n\n') ? prompt.slice(prompt.indexOf('\n\n') + 2) : prompt;
}

export function referenceInputs(refs: VideoReference[]) {
  return refs.map(r => ({ type: `${r.kind}_url`, [`${r.kind}_url`]: { url: r.url } }));
}
