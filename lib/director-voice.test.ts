import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createDialogue, elevenVoices, setElevenKey } from './director-voice';
import { ASSET_DIR } from './reference-assets';

test('provider verification metadata does not block selection or successful speech', async () => {
  const originalFetch = globalThis.fetch;
  const state = globalThis as typeof globalThis & { studioElevenKey?: string };
  const originalKey = state.studioElevenKey;
  const calls: string[] = [];
  let asset: Awaited<ReturnType<typeof createDialogue>> | undefined;
  setElevenKey('unit-test-only');
  globalThis.fetch = async (input, init) => {
    const url = String(input); calls.push(url);
    if (url.includes('/v2/voices')) return Response.json({ voices: [{ voice_id: 'unit_voice', name: 'Unit fixture', category: 'cloned', voice_verification: { requires_verification: true, is_verified: false } }] });
    assert.match(url, /\/v1\/text-to-speech\/unit_voice/);
    const payload = JSON.parse(String(init?.body));
    assert.equal(payload.model_id, 'eleven_v3'); assert.equal(payload.language_code, 'lt'); assert.equal(payload.text, 'Man patinka Lietuva.');
    return new Response(new Uint8Array(5 * 48000));
  };
  try {
    const library = await elevenVoices();
    assert.equal(library.voices[0].available, false);
    assert.equal(library.voices[0].selectable, true);
    assert.equal(library.voices[0].requiresVerification, true);
    assert.equal(library.voices[0].isVerified, false);
    asset = await createDialogue('unit_voice', 'Man patinka Lietuva.', 'lt');
    assert.equal(asset.duration, 5); assert.equal(fs.existsSync(path.join(ASSET_DIR, asset.filename)), true);
    assert.equal(calls.filter(url => url.includes('/text-to-speech/')).length, 1);
  } finally {
    globalThis.fetch = originalFetch; state.studioElevenKey = originalKey;
    if (asset) for (const name of [asset.filename, asset.assetId + '.json']) fs.rmSync(path.join(ASSET_DIR, name), { force: true });
  }
});

test('an actual provider verification rejection is reported without retry or fallback', async () => {
  const originalFetch = globalThis.fetch;
  const state = globalThis as typeof globalThis & { studioElevenKey?: string };
  const originalKey = state.studioElevenKey;
  let submissions = 0;
  setElevenKey('unit-test-only');
  globalThis.fetch = async input => {
    if (String(input).includes('/v2/voices')) return Response.json({ voices: [{ voice_id: 'unit_voice', name: 'Unit fixture', category: 'cloned' }] });
    submissions++;
    return Response.json({ detail: { status: 'voice_not_verified' } }, { status: 403 });
  };
  try {
    await assert.rejects(createDialogue('unit_voice', 'Man patinka Lietuva.', 'lt'), /Tai tiekėjo atsakymas/);
    assert.equal(submissions, 1);
  } finally { globalThis.fetch = originalFetch; state.studioElevenKey = originalKey; }
});
