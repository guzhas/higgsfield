import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { buildOpenRouterBody, calculateVideoPrice, describeOpenRouterRejection, estimateOpenRouter, openRouterDownloadHeaders, openRouterErrorDetails, statusOpenRouter, submitOpenRouter, type VideoModel } from "./openrouter";
import { parseGenerationRequest } from "./payload";
import { defaultParams, getModel } from "./models";
import { HiggsfieldError } from "./higgsfield";
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ASSET_DIR, saveAsset } from './reference-assets';
import { localAssetUrl } from './reference-transport';

const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENROUTER_API_KEY;
const originalMode = process.env.NODE_ENV;
beforeEach(() => { process.env.OPENROUTER_API_KEY = "test-only"; Reflect.set(process.env, 'NODE_ENV', 'test'); });
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalKey;
  if (originalMode === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
  else Reflect.set(process.env, 'NODE_ENV', originalMode);
});

const endpoint = "openrouter:bytedance/seedance-2.5";
const input = { prompt: "A sunset", duration: 5, resolution: "720p", aspect_ratio: "16:9", generate_audio: false };
const seedance: VideoModel = {
  id: "bytedance/seedance-2.5", supported_durations: [4, 5, 30], supported_resolutions: ["480p", "720p"],
  supported_aspect_ratios: ["16:9", "1:1", "9:16"], supported_frame_images: ["first_frame", "last_frame"],
  supported_sizes: ["854x480", "640x640", "480x854", "1280x720", "960x960", "720x1280"],
  pricing_skus: { video_tokens: "0.0000107", video_tokens_without_audio: "0.0000107" },
};

test("pricing matches 720p token billing and selects the correct square/portrait resolution", () => {
  assert.equal(calculateVideoPrice(seedance, input), 1.1556);
  assert.equal(calculateVideoPrice(seedance, { ...input, aspect_ratio: "9:16" }), 1.1556);
  assert.equal(calculateVideoPrice(seedance, { ...input, aspect_ratio: "1:1" }), 1.1556);
  assert.equal(calculateVideoPrice(seedance, { ...input, resolution: "480p", aspect_ratio: "1:1" }), 0.5136);
  const kling = { ...seedance, pricing_skus: { duration_seconds: "0.084", duration_seconds_with_audio: "0.126" } };
  assert.ok(Math.abs(calculateVideoPrice(kling, input)! - 0.42) < 1e-10);
  assert.equal(calculateVideoPrice(kling, { ...input, generate_audio: true }), 0.63);
  assert.equal(calculateVideoPrice({ ...seedance, pricing_skus: {} }, input), null);
});

test("references become ordered frame_images, while normal parameters are preserved", () => {
  const body = buildOpenRouterBody(endpoint, { ...input, first_frame_url: "https://example.com/a.png", last_frame_url: "https://example.com/b.png" });
  assert.equal(body.model, seedance.id);
  assert.equal(body.prompt, input.prompt);
  assert.equal(body.first_frame_url, undefined);
  assert.deepEqual((body.frame_images as { frame_type: string }[]).map((f) => f.frame_type), ["first_frame", "last_frame"]);
  assert.throws(() => buildOpenRouterBody(endpoint, { ...input, first_frame_url: "file:///private" }));
});

test('fixed frames cannot silently override cloned audio',()=>{
  const audio={type:'audio_url',audio_url:{url:'https://example.com/cloned-dialogue.wav'}};
  assert.throws(()=>buildOpenRouterBody(endpoint,{...input,first_frame_url:'https://example.com/frame.png',input_references:[audio]}),/take priority/);
  assert.throws(()=>buildOpenRouterBody(endpoint,{...input,first_frame_url:'https://example.com/frame.png',input_references:[{type:'image_url',image_url:{url:'https://example.com/other.png'}}]}),/take priority/);
});

test('first-frame plus audio parsing binds uploaded assets and blocks ratio or reference substitutions',()=>{
  const frameId=randomUUID(),audioId=randomUUID();
  fs.mkdirSync(ASSET_DIR,{recursive:true});
  const frame={assetId:frameId,filename:`${frameId}.png`,mime:'image/png',kind:'image' as const,url:'https://example.com/frame.png',localUrl:`/api/reference-assets/${frameId}`,width:720,height:1280,bytes:1};
  const audio={assetId:audioId,filename:`${audioId}.wav`,mime:'audio/wav',kind:'audio' as const,url:'https://example.com/voice.wav',localUrl:`/api/reference-assets/${audioId}`,duration:20,bytes:1};
  const files=[path.join(ASSET_DIR,frame.filename),path.join(ASSET_DIR,audio.filename),path.join(ASSET_DIR,`${frameId}.json`),path.join(ASSET_DIR,`${audioId}.json`)];
  try {
    fs.writeFileSync(files[0],Buffer.from([0]));fs.writeFileSync(files[1],Buffer.from([0]));saveAsset(frame);saveAsset(audio);
    const request={modelId:endpoint,prompt:'Use the fixed frame and approved voice.',params:{...input,aspect_ratio:'9:16',generate_audio:true},references:[audio],referenceMode:'references',firstFrame:frame};
    const parsed=parseGenerationRequest(request);
    assert.throws(()=>buildOpenRouterBody(parsed.endpoint,parsed.body),/take priority/);
    assert.throws(()=>parseGenerationRequest({...request,params:{...request.params,aspect_ratio:'16:9'}}),/ratio/);
    assert.throws(()=>parseGenerationRequest({...request,firstFrame:{...frame,url:'https://example.com/changed.png'}}),/no longer matches/);
    assert.throws(()=>parseGenerationRequest({...request,references:[frame]}),/audio only/);
    assert.throws(()=>parseGenerationRequest({...request,firstFrame:audio}),/first-frame image/);
  } finally { for(const file of files)fs.unlinkSync(file); }
});

test('local images and cloned speech are encoded only for the outgoing request, with tamper protection',()=>{
  const frameId=randomUUID(),audioId=randomUUID();
  fs.mkdirSync(ASSET_DIR,{recursive:true});
  const frameBytes=Buffer.from('test frame bytes'),audioBytes=Buffer.from('test speech bytes');
  const frame={assetId:frameId,filename:`${frameId}.png`,mime:'image/png',kind:'image' as const,url:localAssetUrl(frameId),localUrl:`/api/reference-assets/${frameId}`,width:720,height:1280,bytes:frameBytes.length};
  const audio={assetId:audioId,filename:`${audioId}.wav`,mime:'audio/wav',kind:'audio' as const,url:localAssetUrl(audioId),localUrl:`/api/reference-assets/${audioId}`,duration:20,bytes:audioBytes.length};
  const files=[path.join(ASSET_DIR,frame.filename),path.join(ASSET_DIR,audio.filename),path.join(ASSET_DIR,`${frameId}.json`),path.join(ASSET_DIR,`${audioId}.json`)];
  try {
    fs.writeFileSync(files[0],frameBytes);fs.writeFileSync(files[1],audioBytes);saveAsset(frame);saveAsset(audio);
    const request={modelId:endpoint,prompt:'Use the complete scene reference and approved voice.',params:{...input,aspect_ratio:'9:16',generate_audio:true},references:[frame,audio],referenceMode:'references'};
    const parsed=parseGenerationRequest(request);
    assert.ok(!JSON.stringify(parsed.body).includes(';base64,'));
    const outgoing=buildOpenRouterBody(parsed.endpoint,parsed.body);
    assert.deepEqual(outgoing.input_references,[{type:'image_url',image_url:{url:`data:image/png;base64,${frameBytes.toString('base64')}`}},{type:'audio_url',audio_url:{url:`data:audio/wav;base64,${audioBytes.toString('base64')}`}}]);
    assert.equal(outgoing.frame_images,undefined);
    assert.ok(!JSON.stringify(outgoing).includes('studio-asset:'));
    assert.equal(outgoing._studio_inline_assets,undefined);
    const legacy=parseGenerationRequest({modelId:endpoint,prompt:'Use local first frame.',params:request.params,refUrls:[frame.url]});
    assert.deepEqual(buildOpenRouterBody(legacy.endpoint,legacy.body).frame_images,[{type:'image_url',image_url:{url:`data:image/png;base64,${frameBytes.toString('base64')}`},frame_type:'first_frame'}]);
    fs.writeFileSync(files[1],Buffer.from('changed speech'));
    assert.throws(()=>buildOpenRouterBody(parsed.endpoint,parsed.body),/changed after preparation/);
    assert.throws(()=>parseGenerationRequest({...request,references:[{...audio,assetId:frameId}]}),/no longer matches/);
  } finally { for(const file of files)fs.unlinkSync(file); }
});

test("catalog validation blocks unsupported settings before any billable POST", async () => {
  let posts = 0;
  globalThis.fetch = (async (_url, init) => {
    if (init?.method === "POST") posts++;
    return Response.json({ data: [seedance] });
  }) as typeof fetch;
  assert.equal((await estimateOpenRouter(endpoint, input) as { usd: string }).usd, "1.1556");
  await assert.rejects(submitOpenRouter(endpoint, { ...input, duration: 90 }), /not supported/);
  assert.equal(posts, 0);
});

test("submit routes one request to OpenRouter and preserves its ID", async () => {
  let posts = 0;
  globalThis.fetch = (async (url, init) => {
    if (String(url).endsWith("/videos/models")) return Response.json({ data: [seedance] });
    assert.equal(String(url), "https://openrouter.ai/api/v1/videos");
    assert.equal(init?.method, "POST");
    assert.equal(JSON.parse(String(init?.body)).model, seedance.id);
    posts++;
    return Response.json({ id: "job-123", status: "pending" });
  }) as typeof fetch;
  assert.deepEqual(await submitOpenRouter(endpoint, input), { request_id: "job-123", status: "queued" });
  assert.equal(posts, 1);
});

test("failed, expired, and cancelled jobs do not produce outputs; completion records cost", async () => {
  for (const state of ["failed", "expired", "cancelled", "nsfw", "in_progress", "completed"]) {
    globalThis.fetch = (async () => Response.json({ status: state, unsigned_urls: ["https://untrusted.example/video"], usage: { cost: 1.2 }, error: "private metadata" })) as typeof fetch;
    const result = await statusOpenRouter("job-123");
    assert.equal(result.status, state === "expired" ? "failed" : state);
    assert.equal(result.cost, 1.2);
    if (state === "completed") assert.equal(result.videos?.[0].url, "https://openrouter.ai/api/v1/videos/job-123/content?index=0");
    else assert.equal(result.videos, undefined);
    assert.ok(!JSON.stringify(result).includes("private metadata"));
  }
});

test("download credentials are only attached to the exact OpenRouter content origin/path", () => {
  assert.ok(openRouterDownloadHeaders("https://openrouter.ai/api/v1/videos/job-123/content?index=0").Authorization);
  for (const url of ["https://openrouter.ai.evil.example/api/v1/videos/id/content", "http://openrouter.ai/api/v1/videos/id/content", "https://openrouter.ai/api/v1/key"]) {
    assert.throws(() => openRouterDownloadHeaders(url));
  }
});

test("upstream error payloads are not exposed and ambiguous errors are not automatically retried", async () => {
  for (const status of [401, 402, 429, 500]) {
    globalThis.fetch = (async () => Response.json({ error: { message: "private metadata" } }, { status })) as typeof fetch;
    await assert.rejects(statusOpenRouter("job-123"), (error: unknown) => {
      assert.ok(error instanceof HiggsfieldError);
      assert.equal(error.status, status);
      assert.equal(error.retryable, status === 429);
      assert.ok(!error.message.includes("private metadata"));
      return true;
    });
  }
});

test("validation diagnostics classify errors without exposing credentials, asset URLs or raw metadata", () => {
  const privateMessage = 'test-private-key https://private.example/asset.png';
  const cases: [unknown, number, RegExp][] = [
    [{ error: { message: 'Invalid reference URL: input_references[1].audio_url.url: Only HTTPS URLs are allowed' } }, 400, /requires an HTTPS audio reference URL/],
    [{ error: { message: 'Real human faces are not supported. ' + privateMessage } }, 400, /portrait\/face asset restriction/],
    [{ error: { metadata: { raw: JSON.stringify({ error: { message: 'Failed to download reference image ' + privateMessage } }) } } }, 400, /could not access a reference/],
    [{ error: { message: 'input_references not supported ' + privateMessage } }, 422, /unsupported reference mode/],
    [{ error: { message: 'Prompt length exceeds maximum ' + privateMessage } }, 400, /prompt exceeds/],
    [{ error: { message: 'ZDR enforced ' + privateMessage } }, 403, /Zero Data Retention/],
    [{ error: { message: 'Unknown ' + privateMessage } }, 413, /payload is too large/],
  ];
  for (const [payload, status, expected] of cases) {
    const message = describeOpenRouterRejection(payload, status);
    assert.match(message!, expected);
    assert.ok(!message!.includes('test-private-key'));
    assert.ok(!message!.includes('https://'));
  }
  assert.equal(describeOpenRouterRejection({ error: { message: privateMessage } }, 400), undefined);
  assert.equal(describeOpenRouterRejection({ error: { message: 'face moderation' } }, 500), undefined);
  assert.match(describeOpenRouterRejection({ error: { metadata: { raw: JSON.stringify({
    error: { message: 'Unsupported duration' }, request: { prompt: 'Human faces and trusted portrait references' }
  }) } } }, 400)!, /unsupported duration/);
});

test("a rejected submit records a safe actionable reason and is never treated as success or retryable", async () => {
  globalThis.fetch = (async url => String(url).endsWith('/videos/models')
    ? Response.json({ data: [seedance] })
    : Response.json({ error: { message: 'Portrait input not supported; private metadata' } }, { status: 400 })) as typeof fetch;
  await assert.rejects(submitOpenRouter(endpoint, input), (error: unknown) => {
    assert.ok(error instanceof HiggsfieldError);
    assert.match(error.message, /portrait\/face asset restriction/);
    assert.ok(!error.message.includes('private metadata'));
    assert.equal(error.retryable, false);
    return true;
  });
});

test('actual OpenRouter ZodError JSON text preserves the field and is classified correctly', () => {
  const payload = { success: false, error: { name: 'ZodError', message: JSON.stringify([
    { code: 'too_small', path: ['duration'], minimum: 1, message: 'Too small: expected number to be >=1' }
  ]) } };
  assert.deepEqual(openRouterErrorDetails(payload), { messages: ['Too small: expected number to be >=1'], fields: ['duration'] });
  assert.match(describeOpenRouterRejection(payload, 400)!, /unsupported duration/);
});

test('actual Seedance portrait rejection is recognized inside an HTTP-prefixed error message', () => {
  const payload = { error: { message: 'HTTP 400: ' + JSON.stringify({ error: {
    code: 'InputImageSensitiveContentDetected.PrivacyInformation',
    message: "The request failed because the input image 'content[1]' may contain real person. Request id: private-id",
    param: 'content[1]', type: 'BadRequest'
  } }) } };
  const result = describeOpenRouterRejection(payload, 400)!;
  assert.match(result, /reference image because it may contain a real person/);
  assert.match(result, /InputImageSensitiveContentDetected.PrivacyInformation/);
  assert.ok(!result.includes('private-id'));
});

test('retained diagnostic explanations redact credentials and URLs and exclude echoed requests', () => {
  const key = 'short-test-secret';
  const payload = { error: { message: `Invalid asset https://example.com/private.png Bearer ${key}`, metadata: { raw: JSON.stringify({
    error: { message: `Unrecognized field with key ${key}`, path: ['input_references', 0, 'image_url'] },
    request: { prompt: 'PRIVATE REQUEST PROMPT', headers: { Authorization: key } }
  }), headers: { Authorization: key } } } };
  const details = openRouterErrorDetails(payload, [key]);
  const serialized = JSON.stringify(details);
  assert.ok(!serialized.includes(key));
  assert.ok(!serialized.includes('https://'));
  assert.ok(!serialized.includes('PRIVATE REQUEST PROMPT'));
  assert.ok(!serialized.includes('Authorization'));
  assert.deepEqual(details.fields, ['input_references', 'image_url']);
  assert.ok(serialized.includes('Unrecognized field'));
});

test("Higgsfield requests retain their endpoint and OpenRouter IDs remain distinct", () => {
  const hf = getModel("bytedance-seedance-2-5-text-to-video")!;
  const or = getModel(endpoint)!;
  assert.equal(parseGenerationRequest({ modelId: hf.id, prompt: "sunset", params: defaultParams(hf) }).endpoint, "/bytedance/seedance-2.5/text-to-video");
  assert.equal(parseGenerationRequest({ modelId: or.id, prompt: "sunset", params: defaultParams(or) }).endpoint, endpoint);
});
