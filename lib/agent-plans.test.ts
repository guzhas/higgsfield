import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parseAgentBrief, compileAgentBrief, assertAgentRequest, AgentError } from './agent-plans';
import { agentJobId, parseAgentGenerationOptions } from './agent-generation';
import { ASSET_DIR, saveAsset, readAsset, assetPath } from './reference-assets';
import { importVoiceover } from './voiceover-import';
import { referenceInputs, type VideoReference } from './video-references';
import { speechLanguageEvidence } from './seedance-speech';
const example = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'docs', 'agent-brief.example.json'), 'utf8'));

test('native scene acoustics remain prompt guidance and transfer into editing without invented provider fields',()=>{
  const acoustics={space:'open_air',microphone:'phone_camera',distanceMeters:2,referenceContent:'speech_only',ambienceMode:'generate_from_scene',referenceAcoustics:'unknown',soundscape:'Soft sea surf; no music.'};
  const brief=parseAgentBrief({...example,location:{name:'Invented beach',viewpoint:'Phone held 2 m from speaker',minimumReferences:0},audio:{mode:'native',acoustics}});
  const pkg=compileAgentBrief(brief);
  assert.equal(pkg.status,'ready',pkg.blockers.join('; '));
  assert.match(pkg.prompt,/Generate speech and environment together/);
  assert.deepEqual(pkg.adPlan.acoustics,brief.audio.acoustics);
  assert.deepEqual(Object.keys(pkg.generationRequest!.params as object).sort(),['aspect_ratio','duration','generate_audio','resolution']);
  assert.throws(()=>parseAgentBrief({...example,audio:{mode:'native',acoustics:{...acoustics,referenceAcoustics:'roomy'}}}),/kambario aidas/);
  assert.throws(()=>parseAgentBrief({...example,audio:{mode:'native',acoustics:{...acoustics,referenceContent:'mixed',ambienceMode:'preserve_reference'}}}),/no finished reference/);
});

test('agent packet identifies missing real location references; silent invented settings can be ready without a voice', () => {
  const brief = parseAgentBrief(example);
  assert.match(compileAgentBrief(brief).blockers.join(' '), /at least 3/);
  brief.location = { name: 'An invented clay world', viewpoint: 'Eye level', minimumReferences: 0 };
  brief.request = 'A clay animation, with no advertising.'; brief.audio.mode = 'silent';
  const pkg = compileAgentBrief(brief);
  assert.equal(pkg.status, 'ready'); assert.equal(pkg.generationStarted, false);
  assert.equal(pkg.generationRequest?.modelId, 'openrouter:bytedance/seedance-2.5');
  assert.equal((pkg.generationRequest?.params as Record<string,unknown>).generate_audio, false);
  assert.ok(!pkg.prompt.includes('product advertisement'));
});
test('agent packet needs no permission declaration and still rejects secret fields, unknown modes and unsupported durations', () => {
  assert.equal(parseAgentBrief({ ...example, subject: { kind: 'authorized', description: 'Actor' } }).subject.permission, undefined);
  for (const invalid of [{ ...example, apiKey: 'dummy' },
    { ...example, audio: { mode: 'guaranteed-lipsync' } }, { ...example, scenes: [{ duration: 45, action: 'Action', camera: 'Still' }] }]) {
    assert.throws(() => parseAgentBrief(invalid), AgentError);
  }
  const brief = parseAgentBrief(example); brief.audio.mode = 'reference'; brief.location.minimumReferences = 0;
  assert.match(compileAgentBrief(brief).blockers.join(' '), /Voiceovers import/);
});
test('reviews follow actual distinct image bytes and do not count product references as geography', () => {
  fs.mkdirSync(ASSET_DIR, { recursive: true }); const ids = [randomUUID(), randomUUID()];
  const bytes = Buffer.from('synthetic structural test, never a real vision review');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  for (const id of ids) { fs.writeFileSync(path.join(ASSET_DIR, id + '.jpg'), bytes); saveAsset({ assetId: id, filename: id + '.jpg', kind: 'image', mime: 'image/jpeg', url: 'https://example.com/' + id + '.jpg', localUrl: '/api/reference-assets/' + id, width: 1200, height: 800, bytes: bytes.length }); }
  try {
    const brief = parseAgentBrief(example); brief.location.minimumReferences = 1;
    brief.references = [{ assetId: ids[0], usage: 'location', sourceUrl: 'https://example.com/source', rights: 'Technical test', role: 'Background',
      review: { sha256, method: 'vision', reviewer: 'unit-fixture', usable: true, locationMatch: true, viewpointMatch: true, observations: 'Technical fixture only.' } }];
    const pkg = compileAgentBrief(brief); assert.equal(pkg.status, 'ready'); assert.match(pkg.prompt, /@Image1: Background/);
    brief.references.push({ ...brief.references[0], assetId: ids[1] }); brief.location.minimumReferences = 2;
    assert.match(compileAgentBrief(brief).blockers.join(' '), /Duplicate image/);
    brief.references.pop(); brief.references[0].usage = 'product'; brief.location.minimumReferences = 1;
    assert.match(compileAgentBrief(brief).blockers.join(' '), /at least 1/);
    brief.references[0].usage = 'location'; brief.references[0].review!.viewpointMatch = false;
    assert.match(compileAgentBrief(brief).warnings.join(' '), /camera viewpoint/);
    assert.equal(compileAgentBrief(brief).status, 'ready');
    brief.references[0].review!.usable = false;
    assert.equal(compileAgentBrief(brief).status, 'ready');
    fs.writeFileSync(path.join(ASSET_DIR, ids[0] + '.jpg'), 'changed');
    assert.match(compileAgentBrief(brief).blockers.join(' '), /changed after/);
    brief.references[0] = { assetId: ids[0], usage: 'location', role: 'Background' };
    const withoutDeclarations = parseAgentBrief(brief);
    assert.equal(compileAgentBrief(withoutDeclarations).status, 'ready');
    assert.equal(withoutDeclarations.references[0].review, undefined);
  } finally { for (const id of ids) { fs.unlinkSync(path.join(ASSET_DIR, id + '.jpg')); fs.unlinkSync(path.join(ASSET_DIR, id + '.json')); } }
});
test('local access and job IDs stay stable; generation needs no approval and validates optional budget', () => {
  assert.equal(assertAgentRequest(new Request('http://localhost:3000', { headers: { Host: '127.0.0.1:3000', 'X-Video-Agent': 'studio-v1' } }), true), 'http://127.0.0.1:3000');
  assert.throws(() => assertAgentRequest(new Request('http://127.0.0.1:3000'), true));
  const a = agentJobId('a'.repeat(64)); assert.equal(a, agentJobId('a'.repeat(64))); assert.notEqual(a, agentJobId('b'.repeat(64)));
  assert.match(a, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.deepEqual(parseAgentGenerationOptions(), {});
  assert.deepEqual(parseAgentGenerationOptions({}), {});
  assert.deepEqual(parseAgentGenerationOptions({ authorized: false }), {});
  assert.deepEqual(parseAgentGenerationOptions({ maximumUsd: 2 }), { maximumUsd: 2 });
  for (const options of [null, [], { apiKey: 'dummy' }, { maximumUsd: NaN }, { maximumUsd: 0 }, { humanRequest: '' }]) assert.throws(() => parseAgentGenerationOptions(options), AgentError);
});
test('multilingual text keeps its script and never claims universal documented language support', () => {
  for (const [language, text] of [['Arabic','مرحبا بالعالم'], ['Japanese','こんにちは世界'], ['Lithuanian','Sveikas, pasauli.']]) {
    const brief = parseAgentBrief({ ...example, location: { name: 'An invented setting', viewpoint: 'Medium shot', minimumReferences: 0 }, dialogue: { text, language, delivery: 'Clear' } });
    const pkg = compileAgentBrief(brief); assert.equal(pkg.brief.dialogue.text, text); assert.ok(pkg.prompt.includes(text));
    assert.equal(pkg.capabilities.exactLipSync, false);
    if (language === 'Lithuanian') assert.match(pkg.warnings.join(' '), /unverified attempt/);
  }
  assert.equal(speechLanguageEvidence('en-US').documented, true);
  assert.equal(speechLanguageEvidence('lt-LT').documented, false);
});
test('genre instructions support silent footage, custom soundscape and editing captions without imposing advertising or a music ban', () => {
  const brief = parseAgentBrief({ ...example, request: 'A stylized musical scene', location: { name: 'Invented world', viewpoint: 'Wide', minimumReferences: 0 },
    audio: { mode: 'native', soundscape: 'Soft instrumental piano under the dialogue.' }, finishing: 'Stop-motion clay animation, muted color palette.',
    scenes: [{ duration: 8, action: 'Two clay characters exchange the scripted greeting.', camera: 'Locked wide shot.', caption: 'An animated greeting' }] });
  const pkg = compileAgentBrief(brief);
  assert.equal(pkg.status, 'ready'); assert.match(pkg.prompt, /Soft instrumental piano/); assert.match(pkg.prompt, /Stop-motion clay animation/);
  assert.ok(!pkg.prompt.includes('No translation, extra words, competing voices or music'));
  assert.equal(pkg.adPlan.scenes[0].caption, 'An animated greeting');
  assert.ok(!pkg.prompt.includes('An animated greeting'));
});
test('native sound-only scenes do not require speech or invent a language warning', () => {
  const brief = parseAgentBrief({ ...example, request: 'An atmospheric forest scene without speech',
    location: { name: 'An invented forest', viewpoint: 'Wide shot', minimumReferences: 0 },
    dialogue: { text: '', language: 'Lithuanian', delivery: 'No speech' },
    audio: { mode: 'native', soundscape: 'Birdsong, leaves moving in a light breeze, no music.' },
    scenes: [{ duration: 8, action: 'Sunlight moves across a forest floor.', camera: 'Slow forward dolly.' }] });
  const pkg = compileAgentBrief(brief);
  assert.equal(pkg.status, 'ready'); assert.equal(pkg.warnings.length, 0);
  assert.match(pkg.prompt, /No intelligible dialogue or invented narration/);
  assert.ok(!pkg.prompt.includes('Synchronize mouth'));
  assert.equal((pkg.generationRequest?.params as Record<string, unknown>).generate_audio, true);
  brief.audio.soundscape = undefined;
  assert.match(compileAgentBrief(brief).blockers.join(' '), /non-speaking soundscape/);
});

test('finished fractional dialogue reaches the talking package unchanged, with reference roles and no default extra ambience', async () => {
  const duration = 19.52, text = 'Em... Aš visada rūpinuosi savo grožiu.';
  const sourceJobId = 'reference-test-' + randomUUID();
  const bytes = Buffer.alloc(44 + Math.round(duration * 24000) * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(24000, 24); bytes.writeUInt32LE(48000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'audio/wav' }), 'voiceover.wav');
  form.append('manifest', JSON.stringify({ schemaVersion: 1, source: 'voiceovers', sourceJobId, status: 'completed', text, language: 'Lithuanian', durationSeconds: duration }));
  const imported = (await importVoiceover(new Request('http://127.0.0.1:3000/api/voiceover-import', {
    method: 'POST', headers: { 'X-Voiceover-Client': 'voiceovers-v1' }, body: form,
  }))).data;
  const asset = readAsset(imported.asset.assetId);
  // Synthetic fixture, not a live voice/lip-sync or cloud publication test.
  saveAsset({ ...asset, url: 'https://example.com/finished-dialogue.wav' });
  try {
    const brief = parseAgentBrief({ ...example,
      location: { name: 'Invented square', viewpoint: 'Eye-level medium shot', minimumReferences: 0 },
      dialogue: { text, language: 'Lithuanian', delivery: 'Street interview' },
      audio: { mode: 'reference', voiceoverImportId: imported.importId },
      scenes: [{ duration, action: 'The presenter speaks to an off-camera interviewer.', camera: 'Steady medium shot.' }],
    });
    const pkg = compileAgentBrief(brief);
    assert.equal(pkg.status, 'ready', pkg.blockers.join('; '));
    const params = pkg.generationRequest?.params as Record<string, unknown>;
    assert.equal(params.duration, 20);
    assert.equal(params.generate_audio, true);
    assert.equal(pkg.adPlan.voiceDuration, duration);
    assert.deepEqual(fs.readFileSync(assetPath(asset)), bytes);
    assert.deepEqual(referenceInputs(pkg.generationRequest!.references as VideoReference[]), [
      { type: 'audio_url', audio_url: { url: 'https://example.com/finished-dialogue.wav' } },
    ]);
    assert.ok(pkg.prompt.includes(`DIALOGUE (Lithuanian, verbatim): {${JSON.stringify(text)}}`));
    assert.match(pkg.prompt, /@Audio1 supplies the complete spoken dialogue/);
    assert.match(pkg.prompt, /breathing and hesitation timing/);
    assert.match(pkg.prompt, /lip closures and jaw articulation/);
    assert.match(pkg.prompt, /Do not add a second ambience layer/);
    assert.match(pkg.prompt, /trim the visual tail to 19.52s/);
    assert.equal(pkg.capabilities.exactLipSync, false);
    brief.audio.soundscape = 'Add the requested quiet birdsong; no music.';
    const custom = compileAgentBrief(brief);
    assert.match(custom.prompt, /Add the requested quiet birdsong/);
    assert.ok(!custom.prompt.includes('Do not add a second ambience layer'));
    brief.scenes[0].duration = 19;
    assert.match(compileAgentBrief(brief).blockers.join(' '), /measured voiceover length/);
  } finally {
    for (const file of [assetPath(asset), path.join(ASSET_DIR, asset.assetId + '.json'),
      path.join(process.cwd(), 'storage', 'voiceover-imports', imported.importId + '.json')]) fs.unlinkSync(file);
  }
});
