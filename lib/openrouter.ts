import { OPENROUTER_PREFIX } from "./openrouter-models";
import { HiggsfieldError, type Estimate, type StatusResponse, type SubmitResponse } from "./higgsfield";
import fs from 'node:fs';
import { inlineAssetUrl, isLocalAssetUrl, type InlineAssetBinding } from './reference-transport';

const BASE = "https://openrouter.ai/api/v1";
export const isOpenRouter = (endpoint: string) => endpoint.startsWith(OPENROUTER_PREFIX);
export const hasOpenRouterCredentials = () => Boolean(process.env.OPENROUTER_API_KEY?.trim());

function headers(): Record<string, string> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new HiggsfieldError("Set OPENROUTER_API_KEY in .env and restart the server.", 401);
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

/** Retain error explanations, never request bodies, headers, credentials or asset URLs. */
export function openRouterErrorDetails(payload: unknown, secrets: string[] = []): { messages: string[]; fields: string[] } {
  const messages: string[] = [];
  const fields = new Set<string>();
  const allowedFields = new Set(['model', 'duration', 'resolution', 'aspect_ratio', 'size', 'prompt', 'seed', 'generate_audio', 'input_references', 'frame_images', 'provider', 'image_url', 'video_url', 'audio_url', 'url', 'type', 'frame_type']);
  function clean(text: string): string {
    for (const secret of secrets.filter(Boolean)) text = text.split(secret).join('[REDACTED]');
    return text.replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]')
      .replace(/data:(?:image|audio)\/[^;\s]+;base64,[A-Za-z0-9+/=]+/g, '[INLINE_MEDIA]')
      .replace(/Bearer\s+[^\s"<>]+/gi, 'Bearer [REDACTED]')
      .replace(/https?:\/\/[^\s"<>]+/gi, '[URL]')
      .replace(/\b[A-Za-z0-9_+\/-]{40,}(?:={0,2})\b/g, '[REDACTED]').slice(0, 1000);
  }
  function collect(value: unknown, depth = 0): void {
    if (depth > 8 || value == null || messages.length >= 20) return;
    if (typeof value === 'string') {
      if (value.length > 32_000) return;
      try { const parsed: unknown = JSON.parse(value); if (parsed && typeof parsed === 'object') { collect(parsed, depth + 1); return; } } catch { /* Plain explanation. */ }
      messages.push(clean(value));
    } else if (Array.isArray(value)) value.slice(0, 20).forEach(item => collect(item, depth + 1));
    else if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      for (const location of [record.path, record.loc]) {
        if (Array.isArray(location)) for (const field of location) if (typeof field === 'string' && allowedFields.has(field)) fields.add(field);
      }
      // Deliberately exclude echoed request/input/header objects and arbitrary metadata.
      for (const key of ['error', 'message', 'msg', 'detail', 'details', 'issues', 'errors']) collect(record[key], depth + 1);
      if (record.metadata && typeof record.metadata === 'object') collect((record.metadata as Record<string, unknown>).raw, depth + 1);
    }
  }
  collect(payload);
  return { messages: [...new Set(messages)], fields: [...fields] };
}

/** Inspect only in memory; return fixed messages, never provider metadata or URLs. */
export function describeOpenRouterRejection(payload: unknown, status: number): string | undefined {
  if (![400, 403, 413, 422].includes(status)) return;
  const hints: string[] = [];
  function collect(value: unknown, depth = 0): void {
    if (depth > 8 || value == null || hints.length >= 100) return;
    if (typeof value === 'string') {
      const text = value.slice(0, 16_000);
      try {
        const parsed: unknown = JSON.parse(text);
        if (parsed && typeof parsed === 'object') { collect(parsed, depth + 1); return; }
      } catch { /* A plain message. */ }
      hints.push(text);
    } else if (Array.isArray(value)) {
      value.slice(0, 20).forEach(item => collect(item, depth + 1));
    } else if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      for (const key of ['error', 'message', 'msg', 'detail', 'details', 'issues', 'code', 'type', 'metadata', 'raw', 'errors', 'loc', 'path']) collect(record[key], depth + 1);
    }
  }
  collect(payload);
  const hint = hints.join(' ').toLowerCase();
  if (/only https urls are allowed/.test(hint) && /audio_url/.test(hint)) return 'OpenRouter requires an HTTPS audio reference URL and rejected local-inline audio. Files can remain local, but this transport cannot start a talking-video job.';
  if (/inputimagesensitivecontentdetected\.privacyinformation/.test(hint) ||
      (/input image/.test(hint) && /may contain real person/.test(hint))) {
    return 'OpenRouter\'s provider rejected a reference image because it may contain a real person (InputImageSensitiveContentDetected.PrivacyInformation). A provider-supported portrait asset workflow is required.';
  }
  if (/\b(zdr|zero[- ]data[- ]retention)\b/.test(hint)) return 'OpenRouter rejected video routing because Zero Data Retention is enforced. Check your OpenRouter privacy settings.';
  if (/\b(face|faces|portrait|real[- ]person|human[- ]face)\b/.test(hint) && /reject|restrict|not support|unsupported|not allow|block|moder|authoriz|trust/.test(hint)) {
    return 'OpenRouter reported a portrait/face asset restriction. Use a provider-supported authorized or trusted portrait asset workflow.';
  }
  if (/moderation|content[- _]policy|safety[- _]violation|sensitive[- _]content|content[- _]filter/.test(hint)) return 'OpenRouter reported a content moderation restriction. Review the provider requirements before another request.';
  if (/(image|reference|asset|url)/.test(hint) && /download|fetch|inaccessible|unreachable|expired|access denied|failed to load/.test(hint)) return 'OpenRouter could not access a reference asset. Check its public URL and availability.';
  if (/(reference|input_references|frame_images)/.test(hint) && /not support|unsupported|not allow/.test(hint)) return 'OpenRouter reported an unsupported reference mode or reference asset type for this request.';
  if (/prompt/.test(hint) && /too long|too large|maximum|max_length|length limit|exceed/.test(hint)) return 'OpenRouter reported that the prompt exceeds an upstream length limit.';
  if (/duration/.test(hint) && /invalid|not support|unsupported|must|allow|expected/.test(hint)) return 'OpenRouter reported an invalid or unsupported duration.';
  if (/(resolution|aspect_ratio|aspect ratio|dimensions)/.test(hint) && /invalid|not support|unsupported|must|allow|expected/.test(hint)) return 'OpenRouter reported unsupported output dimensions, resolution or aspect ratio.';
  if (status === 413) return 'OpenRouter rejected the request because its payload is too large.';
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, { ...init, headers: headers(), signal: AbortSignal.timeout(60_000), cache: "no-store" });
  } catch (error) {
    if (error instanceof HiggsfieldError) throw error;
    throw new HiggsfieldError("OpenRouter connection failed. Check the dashboard before resubmitting a generation.", 502);
  }
  if (!res.ok) {
    const messages: Record<number, string> = {
      400: "OpenRouter rejected the generation parameters.",
      401: "OpenRouter API key is invalid or missing.",
      402: "OpenRouter credits or key spending limit exhausted.",
      403: "OpenRouter access denied. Check key permissions and video/ZDR settings.",
      404: "OpenRouter model or request not found.",
      429: "OpenRouter rate limit reached; waiting before retrying.",
    };
    let diagnostic: string | undefined;
    // Never log or forward raw upstream errors: they can contain request metadata.
    if ([400, 403, 413, 422].includes(res.status)) {
      try {
        const payload: unknown = await res.json();
        diagnostic = describeOpenRouterRejection(payload, res.status);
        const details = openRouterErrorDetails(payload, [process.env.OPENROUTER_API_KEY?.trim() ?? '']);
        if (path === '/videos' && init.method === 'POST' && process.env.NODE_ENV !== 'test') {
          try {
            const directory = 'storage/diagnostics';
            fs.mkdirSync(directory, { recursive: true });
            fs.writeFileSync(`${directory}/openrouter-video-rejection.json`, JSON.stringify({ at: new Date().toISOString(), status: res.status, ...details }, null, 2));
          } catch { /* Diagnostic persistence must not change the request outcome. */ }
        }
      } catch { /* Retain the safe fallback. */ }
    }
    throw new HiggsfieldError(diagnostic ?? messages[res.status] ?? `OpenRouter request failed (HTTP ${res.status}).`, res.status, res.status === 429,
      Math.max(1, Number(res.headers.get("retry-after")) || 30) * 1000);
  }
  return res.json() as Promise<T>;
}

export interface VideoModel {
  id: string;
  supported_durations: number[];
  supported_resolutions: string[];
  supported_aspect_ratios: string[];
  supported_sizes: string[];
  supported_frame_images?: string[];
  pricing_skus: Record<string, string>;
}
let catalog: { expires: number; models: VideoModel[] } | undefined;
export async function videoModels(): Promise<VideoModel[]> {
  if (catalog && catalog.expires > Date.now()) return catalog.models;
  const data = await call<{ data: VideoModel[] }>("/videos/models");
  catalog = { expires: Date.now() + 5 * 60_000, models: data.data };
  return data.data;
}

export function buildOpenRouterBody(endpoint: string, input: Record<string, unknown>): Record<string, unknown> {
  const { first_frame_url, last_frame_url, ...raw } = input;
  const body = Object.fromEntries(Object.entries(raw).filter(([key]) => !key.startsWith('_studio_')));
  const bindings = Array.isArray(input._studio_inline_assets) ? input._studio_inline_assets as InlineAssetBinding[] : [];
  if (Array.isArray(body.input_references) && body.input_references.length && (first_frame_url || last_frame_url)) {
    throw new HiggsfieldError('Fixed frames take priority over all references, including audio. Use image and audio references together without fixed frames to preserve cloned-speech guidance.', 400);
  }
  const frames = [first_frame_url, last_frame_url].flatMap((url, i) => {
    if (!url) return [];
    if (typeof url !== "string" || !(url.startsWith("https://") || isLocalAssetUrl(url))) throw new HiggsfieldError("Reference images need an uploaded local asset or a public HTTPS URL.", 400);
    return [{ type: "image_url", image_url: { url: inlineAssetUrl(url,'image',bindings) }, frame_type: i === 0 ? "first_frame" : "last_frame" }];
  });
  if (Array.isArray(body.input_references)) body.input_references = body.input_references.map(r => {
    const kind = String(r.type).replace(/_url$/,''), key = `${kind}_url`, value = r[key];
    return value?.url ? {...r,[key]:{...value,url:inlineAssetUrl(value.url,kind,bindings)}} : r;
  });
  const result = { ...body, model: endpoint.slice(OPENROUTER_PREFIX.length), ...(frames.length ? { frame_images: frames } : {}) };
  if (Buffer.byteLength(JSON.stringify(result)) > 64*1024*1024) throw new HiggsfieldError('Inline generation request exceeds 64 MiB.',400);
  return result;
}

async function validate(endpoint: string, input: Record<string, unknown>): Promise<VideoModel> {
  const model = (await videoModels()).find((m) => m.id === endpoint.slice(OPENROUTER_PREFIX.length));
  if (!model) throw new HiggsfieldError("This model is not currently available on OpenRouter.", 404);
  if (!model.supported_durations.includes(Number(input.duration)) ||
      !model.supported_resolutions.includes(String(input.resolution)) ||
      !model.supported_aspect_ratios.includes(String(input.aspect_ratio))) {
    throw new HiggsfieldError("The selected duration, resolution or ratio is not supported by OpenRouter.", 400);
  }
  for (const [key, frame] of [["first_frame_url", "first_frame"], ["last_frame_url", "last_frame"]]) {
    if (input[key] && !model.supported_frame_images?.includes(frame)) throw new HiggsfieldError("The selected frame type is not supported.", 400);
  }
  return model;
}

export function calculateVideoPrice(model: VideoModel, input: Record<string, unknown>): number | null {
  if (Array.isArray(input.input_references) && input.input_references.some(r => r?.type === 'video_url')) return null;
  const rates = model.pricing_skus;
  const seconds = Number(input.duration);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  if (rates.video_tokens) {
    const [rw, rh] = String(input.aspect_ratio).split(":").map(Number);
    const targetArea = input.resolution === "720p" ? 1280 * 720 : 854 * 480;
    const candidates = model.supported_sizes.map((s) => s.split("x").map(Number))
      .filter(([w, h]) => Math.abs(w / h - rw / rh) < 0.03);
    candidates.sort((a, b) => Math.abs(a[0] * a[1] - targetArea) - Math.abs(b[0] * b[1] - targetArea));
    const dims = candidates[0];
    if (!dims || Math.abs(dims[0] / dims[1] - rw / rh) > 0.03) return null;
    const rate = Number(input.generate_audio === false ? rates.video_tokens_without_audio ?? rates.video_tokens : rates.video_tokens);
    return Number.isFinite(rate) ? Math.ceil(dims[0] * dims[1] * seconds * 24 / 1024) * rate : null;
  }
  const rate = Number(input.generate_audio ? rates.duration_seconds_with_audio : rates.duration_seconds);
  return Number.isFinite(rate) ? rate * seconds : null;
}

export async function estimateOpenRouter(endpoint: string, input: Record<string, unknown>): Promise<Estimate> {
  const model = await validate(endpoint, input);
  const usd = calculateVideoPrice(model, input);
  if (usd === null && Array.isArray(input.input_references) && input.input_references.some(r => r?.type === 'video_url')) return { type: 'description', pricing_description: 'Video references are billed for input and output tokens. A reliable total is unavailable before generation; actual usage is recorded after completion.' };
  if (usd === null) throw new HiggsfieldError("No reliable price is available for these OpenRouter settings.", 503);
  return { usd: String(usd), credits: "0" };
}

export async function submitOpenRouter(endpoint: string, input: Record<string, unknown>): Promise<SubmitResponse> {
  await validate(endpoint, input);
  const result = await call<{ id: string; status: string }>("/videos", { method: "POST", body: JSON.stringify(buildOpenRouterBody(endpoint, input)) });
  if (!result.id) throw new HiggsfieldError("OpenRouter did not return a request ID. Check the dashboard before retrying.", 502);
  return { request_id: result.id, status: result.status === "pending" ? "queued" : result.status };
}

export async function statusOpenRouter(id: string): Promise<StatusResponse> {
  const result = await call<{ status: string; unsigned_urls?: string[]; error?: unknown; usage?: { cost?: number } }>(`/videos/${encodeURIComponent(id)}`);
  const status = result.status === "pending" ? "queued" : result.status === "expired" ? "failed" : result.status;
  const cost = result.usage?.cost;
  return {
    request_id: id, status,
    error: ["failed", "expired"].includes(result.status) ? "OpenRouter generation failed or expired. See the OpenRouter dashboard for details." : undefined,
    videos: status === "completed" ? (result.unsigned_urls?.length ? result.unsigned_urls : [""]).map((_, index) => ({ url: `${BASE}/videos/${encodeURIComponent(id)}/content?index=${index}` })) : undefined,
    cost: typeof cost === "number" && Number.isFinite(cost) && cost >= 0 ? cost : undefined,
  };
}

export function openRouterDownloadHeaders(url: string): Record<string, string> {
  const parsed = new URL(url);
  if (parsed.origin !== "https://openrouter.ai" || !/^\/api\/v1\/videos\/[^/]+\/content$/.test(parsed.pathname)) {
    throw new Error("Invalid OpenRouter content URL.");
  }
  return headers();
}
