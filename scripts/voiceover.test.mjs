import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { paidStage, pcmToWav, validateRequest } from './voiceover.mjs';
import { wavInfo } from './voiceover-outdoor.mjs';

const fixture = () => fs.mkdtempSync(path.join(os.tmpdir(), 'studio-voiceover-'));
const stageOptions = directory => ({ directory, name: 'voice', key: 'runtime-test-only', endpoint: '/test', payload: { text: 'Labas' }, convert: pcmToWav });

test('completed paid audio is reused, changed requests and damaged files cannot trigger a duplicate charge', async () => {
  const directory = fixture();
  let calls = 0;
  const fetchImpl = async () => { calls++; return new Response(Buffer.alloc(48000), { status: 200 }); };
  try {
    const options = { ...stageOptions(directory), fetchImpl };
    await paidStage(options);
    await paidStage(options);
    assert.equal(calls, 1);
    await assert.rejects(paidStage({ ...options, payload: { text: 'Changed' } }), /Changed request/);
    fs.writeFileSync(path.join(directory, 'voice.wav'), 'damaged');
    await assert.rejects(paidStage(options), /needs review/);
    assert.equal(calls, 1);
    assert.ok(!fs.readFileSync(path.join(directory, 'voice.json'), 'utf8').includes(options.key));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

for (const outcome of ['unknown', 'rejected']) test(`${outcome} paid outcomes never retry automatically`, async () => {
  const directory = fixture();
  let calls = 0;
  try {
    const options = { ...stageOptions(directory), fetchImpl: async () => {
      calls++;
      if (outcome === 'unknown') throw new Error('network lost');
      return Response.json({ detail: { status: 'voice_not_verified', message: 'private rejection body' } }, { status: 403 });
    } };
    await assert.rejects(paidStage(options), /did not complete/);
    const ledger = JSON.parse(fs.readFileSync(path.join(directory, 'voice.json')));
    assert.equal(ledger.status, outcome);
    if (outcome === 'rejected') {
      assert.equal(ledger.providerCode, 'voice_not_verified');
      assert.ok(!JSON.stringify(ledger).includes('private rejection body'));
    }
    await assert.rejects(paidStage(options), /needs review/);
    assert.equal(calls, 1);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('speech duration and provider settings are bounded before paid submission', () => {
  const input = { voiceId: 'test', language: 'lt', text: 'Meditacija.' };
  const v3=validateRequest({...input,similarityBoost:0.8});
  assert.ok(!('similarity_boost' in v3.voiceSettings));
  assert.equal(v3.ignoredSettings.length,1);
  for (const speed of [NaN, 0.69, 1.21]) assert.throws(() => validateRequest({ ...input, speed }));
  assert.throws(() => validateRequest({ ...input, ambience: { prompt: 'Ocean', durationSeconds: 31 } }));
  assert.throws(() => pcmToWav(Buffer.alloc(48000 * 31)));
  assert.throws(() => pcmToWav(Buffer.alloc(3)));
  const wav = pcmToWav(Buffer.alloc(48000));
  assert.equal(wav.readUInt32LE(24), 24000);
  assert.equal(wav.readUInt32LE(40) / wav.readUInt32LE(28), 1);
});

test('isolation sends multipart audio without overriding its boundary, and caches separately', async () => {
  const directory = fixture();
  const body = new FormData();
  body.append('audio', new Blob([pcmToWav(Buffer.alloc(48000))]), 'voice.wav');
  let calls = 0;
  try {
    const options = { ...stageOptions(directory), name: 'isolation', mediaName: 'isolated-voice.audio',
      payload: { sourceSha256: 'source-a' }, body, convert: value => value,
      fetchImpl: async (_, init) => {
        calls++;
        assert.equal(init.body, body);
        assert.equal(init.headers['Content-Type'], undefined);
        return new Response('isolated-media');
      } };
    const result = await paidStage(options);
    assert.equal(path.basename(result.file), 'isolated-voice.audio');
    await paidStage(options);
    await assert.rejects(paidStage({ ...options, payload: { sourceSha256: 'source-b' } }), /Changed request/);
    assert.equal(calls, 1);
    await assert.rejects(paidStage({ ...options, mediaName: '../escape.mp3' }), /Invalid media filename/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('WAV verification measures duration/peaks and rejects truncated media', () => {
  const pcm = Buffer.alloc(48000);
  pcm.writeInt16LE(-12000, 0);
  const wav = pcmToWav(pcm);
  assert.deepEqual(wavInfo(wav), { seconds: 1, channels: 1, rate: 24000, peak: 12000 });
  assert.throws(() => wavInfo(wav.subarray(0, wav.length - 1)), /Truncated WAV/);
});
