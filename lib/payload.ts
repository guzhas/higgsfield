import { buildBody, getModel, resolveEndpoint, type ModelDef } from "./models";
import { referenceInputs, validateReferences, withReferenceRoles, type VideoReference, type ReferenceMode } from './video-references';
import { readAsset } from './reference-assets';
import { bindInlineAssets, isLocalAssetUrl } from './reference-transport';

/**
 * Shared parsing for /api/generate and /api/estimate — both take the same shape
 * from the prompt bar, and the estimate must be built from an identical body or
 * the quoted price won't match what gets charged.
 */

export interface GenerationRequest {
  model: ModelDef;
  endpoint: string;
  body: Record<string, unknown>;
  prompt: string;
  batch: number;
  refUrls: string[];
}

export class BadRequest extends Error {}

export function parseGenerationRequest(input: unknown): GenerationRequest {
  const raw = (input ?? {}) as Record<string, unknown>;

  const model = getModel(String(raw.modelId ?? ""));
  if (!model) throw new BadRequest(`Unknown model: ${String(raw.modelId)}`);

  let prompt = String(raw.prompt ?? "").trim();
  if (!prompt) throw new BadRequest("A prompt is required.");

  const refUrls = Array.isArray(raw.refUrls) ? raw.refUrls.map(String).filter(Boolean) : [];
  if (model.refRequired && refUrls.length === 0 && !(Array.isArray(raw.references) && raw.references.length)) {
    throw new BadRequest(`${model.name} needs a reference image.`);
  }

  const batchRaw = Number(raw.batch ?? 1);
  const batch = Number.isFinite(batchRaw) ? Math.max(1, Math.round(batchRaw)) : 1;

  const params = (raw.params ?? {}) as Record<string, unknown>;
  let endpoint = resolveEndpoint(model, refUrls.length > 0);
  const body = buildBody(model, prompt, params, batch, refUrls);
  for (const def of model.params) {
    const value = body[def.key];
    if (value === undefined) continue;
    if (def.type === 'enum' && !def.options?.includes(value as string | number)) throw new BadRequest(`Choose a supported ${def.label.toLowerCase()}.`);
    if ((def.type === 'int' || def.type === 'float') && (typeof value !== 'number' || (def.min !== undefined && value < def.min) || (def.max !== undefined && value > def.max))) throw new BadRequest(`${def.label} is outside the supported range.`);
  }

  if (raw.references !== undefined) {
    if (!model.referenceModes) throw new BadRequest('This model does not support mixed references.');
    const mode = (raw.referenceMode ?? 'references') as ReferenceMode;
    if (!model.referenceModes.includes(mode)) throw new BadRequest('This reference mode is not supported by the selected model.');
    if (!Array.isArray(raw.references)) throw new BadRequest('Invalid references.');
    try {
      const references = (raw.references as VideoReference[]).map(r => {
        if (r.assetId) {
          const asset = readAsset(r.assetId);
          if (asset.url !== r.url || asset.kind !== r.kind) throw new Error('The reference no longer matches its uploaded asset.');
          return { ...r, duration: asset.duration, width: asset.width, height: asset.height, bytes: asset.bytes, frameRate: asset.frameRate };
        }
        if (r.kind !== 'image') throw new Error('Upload audio and video references so their duration can be verified.');
        return r;
      });
      validateReferences(references, mode);
      if (mode === 'frames' && references.length > (model.maxFrameImages ?? 2)) throw new Error('This provider supports only a first-frame image in this mode.');
      if (refUrls.length) throw new Error('Use one reference mode at a time.');
      if (mode === 'references') {
        if (references.length && model.referenceEndpoint) endpoint = model.referenceEndpoint;
        prompt = withReferenceRoles(prompt, references);
        body.prompt = prompt;
        if (model.provider === 'openrouter') { if (references.length) body.input_references = referenceInputs(references); }
        else for (const kind of ['image', 'video', 'audio']) {
          const urls = references.filter(r => r.kind === kind).map(r => r.url);
          if (urls.length) body[`${kind}_urls`] = urls;
        }
      } else {
        if (model.provider === 'openrouter') {
          if (references[0]) body.first_frame_url = references[0].url;
          if (references[1]) body.last_frame_url = references[1].url;
        } else if (references[0] && model.imageEndpoint && model.refImageKey) {
          endpoint = model.imageEndpoint; body[model.refImageKey] = references[0].url;
        }
        if (references[0]?.width && references[0]?.height) {
          const [w, h] = String(body.aspect_ratio).split(':').map(Number);
          if (Math.abs(references[0].width / references[0].height - w / h) > 0.03) throw new Error('Choose an output ratio matching the first frame.');
        }
      }
      body._studio_references = references;
      body._studio_reference_mode = mode;
    } catch (error) { throw new BadRequest(error instanceof Error ? error.message : 'Invalid references.'); }
  }

  if (raw.firstFrame !== undefined) {
    try {
      if (model.id !== 'openrouter:bytedance/seedance-2.5' || raw.referenceMode !== 'references' || !Array.isArray(raw.references) || refUrls.length) throw new Error('Fixed first-frame plus audio is available only through the Seedance 2.5 reference workflow.');
      const frame = raw.firstFrame as VideoReference;
      if (!frame || frame.kind !== 'image' || !frame.assetId) throw new Error('Upload the fixed first-frame image before preparing it.');
      const asset = readAsset(frame.assetId);
      if (asset.kind !== 'image' || asset.url !== frame.url) throw new Error('The first frame no longer matches its uploaded asset.');
      if ((raw.references as VideoReference[]).some(r => r.kind !== 'audio')) throw new Error('A fixed first frame can be combined with audio only; do not mix other image or video references.');
      validateReferences([{...asset}], 'frames');
      const [w,h] = String(body.aspect_ratio).split(':').map(Number);
      if (!asset.width || !asset.height || Math.abs(asset.width/asset.height-w/h)>0.03) throw new Error('Choose an output ratio matching the first frame.');
      body.first_frame_url = asset.url;
      body._studio_first_frame = asset;
    } catch (error) { throw new BadRequest(error instanceof Error ? error.message : 'Invalid first frame.'); }
  }

  const inlineRefs = [...(Array.isArray(body._studio_references) ? body._studio_references as VideoReference[] : []),...(body._studio_first_frame ? [body._studio_first_frame as VideoReference] : [])];
  for (const key of ['first_frame_url','last_frame_url']) {
    const url = body[key];
    if (typeof url === 'string' && isLocalAssetUrl(url) && !inlineRefs.some(r=>r.url===url)) {
      const frame = readAsset(url.slice('studio-asset:'.length));
      if (frame.kind !== 'image' || frame.url !== url) throw new BadRequest('The frame no longer matches its local image asset.');
      validateReferences([frame],'frames');
      const [w,h] = String(body.aspect_ratio).split(':').map(Number);
      if (!frame.width || !frame.height || Math.abs(frame.width/frame.height-w/h)>0.03) throw new BadRequest('Choose an output ratio matching the first frame.');
      inlineRefs.push(frame);
    }
  }
  if (inlineRefs.some(r => isLocalAssetUrl(r.url))) {
    if (model.id !== 'openrouter:bytedance/seedance-2.5') throw new BadRequest('Local inline references are implemented for OpenRouter Seedance 2.5 only.');
    try { body._studio_inline_assets = bindInlineAssets(inlineRefs); }
    catch (error) { throw new BadRequest((error as Error).message); }
  }

  return { model, endpoint, body, prompt, batch, refUrls };
}
