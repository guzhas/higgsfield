import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adDuration, buildAdPrompt, generationDuration, newAdPlan, planFromVoiceover, planIssues, sceneTimeline } from './ad-plan';
import { VOICEOVER_CAPABILITIES } from './voiceover-contract';

test('ad editor retains outdoor microphone direction and blocks incompatible known source audio',()=>{
  const plan=newAdPlan();plan.product='Meditation invitation';plan.audioMode='generated';
  plan.scenes.forEach(s=>{s.visual='A presenter on a beach.';s.narration='Sveiki.';});
  plan.acoustics={space:'open_air',microphone:'phone_camera',distanceMeters:2,referenceContent:'speech_only',ambienceMode:'generate_from_scene',referenceAcoustics:'unknown',soundscape:'Small waves.'};
  const prompt=buildAdPrompt(plan);assert.match(prompt,/phone microphone approximately 2 m/);
  assert.ok(!prompt.includes('appropriate room tone'));
  assert.match(prompt,/Generate speech and environment together/);
  plan.acoustics.referenceAcoustics='roomy';assert.match(planIssues(plan).join(' '),/kambario aidas/);
  assert.throws(()=>buildAdPrompt(plan),/kambario aidas/);
});

test('ad timeline is contiguous and prompts separate original voiceover from generated speech and captions', () => {
  const plan = newAdPlan(); plan.product = 'Blue packaging, white logo.';
  plan.scenes.forEach((s, i) => { s.visual = `Product action ${i}.`; s.narration = `Exact words ${i}.`; s.caption = 'Only in editing'; });
  assert.equal(adDuration(plan), 15);
  assert.deepEqual(sceneTimeline(plan).map(s => [s.start, s.end]), [[0, 5], [5, 10], [10, 15]]);
  assert.deepEqual(planIssues(plan), []);
  const original = buildAdPrompt(plan);
  assert.match(original, /added unchanged in editing/);
  assert.ok(!original.includes('Exact words') && !original.includes('Only in editing'));
  const generated = buildAdPrompt({ ...plan, audioMode: 'generated' });
  assert.match(generated, /Dialogue in Lithuanian: "Exact words 0/);
  plan.scenes[0].duration = 2;
  assert.match(buildAdPrompt(plan, 0), /4-second/);
  assert.match(buildAdPrompt(plan, 0), /\[2–4s\] Hold/);
});
test('invalid scene plans cannot be generated', () => {
  const plan = newAdPlan();
  assert.ok(planIssues(plan).length >= 2);
  plan.product = 'Product'; plan.scenes.forEach(s => { s.visual = 'Action'; s.duration = 15; });
  assert.match(planIssues(plan).join(' '), /4–30/);
  plan.scenes[0].duration = NaN;
  assert.match(planIssues(plan).join(' '), /between 1 and 30/);
});

test('imported fractional voiceover keeps exact editing length and rounds only the model request', () => {
  const plan = planFromVoiceover({ schemaVersion: 1, importId: 'a'.repeat(64), compositionUrl: '/ads', generationStarted: false,
    capabilities: VOICEOVER_CAPABILITIES, asset: { assetId: 'voice-id', localUrl: '/audio', kind: 'audio', mime: 'audio/wav', duration: 12.345, bytes: 600000 },
    manifest: { schemaVersion: 1, source: 'voiceovers', sourceJobId: 'job-1', status: 'completed', text: 'Exact transcript', language: 'English', durationSeconds: 12.345 } });
  plan.product = 'ThinkPad'; plan.scenes[0].visual = 'Product demonstration with no visible talking mouth.';
  assert.deepEqual(planIssues(plan), []);
  assert.equal(adDuration(plan), 12.345);
  assert.equal(generationDuration(plan), 13);
  assert.match(buildAdPrompt(plan), /Create a 13-second/);
  assert.match(buildAdPrompt(plan), /\[12.345–13s\] Hold/);
  assert.ok(!buildAdPrompt(plan).includes('Exact transcript'));
  assert.equal(plan.voiceAssetId, 'voice-id');
  assert.equal(plan.references.length, 0);
  assert.equal(plan.audioMode, 'original');
});

test('talking-video reference mode requires published voice audio and does not silently use original-audio B-roll', () => {
  const plan = newAdPlan(); plan.product = 'PhoneBridger'; plan.audioMode = 'reference'; plan.voiceAssetId = 'local-voice'; plan.voiceDuration = 15;
  plan.scenes.forEach(s => { s.visual = 'One invented presenter talks to camera.'; s.narration = 'Approved spoken words.'; });
  assert.match(planIssues(plan).join(' '), /Upload the voiceover/);
  plan.voiceReferenceAssetId = 'public-voice';
  plan.references = [{ assetId: 'public-voice', url: 'https://example.com/voice.wav', kind: 'audio', duration: 15 }];
  assert.deepEqual(planIssues(plan), []);
  assert.match(buildAdPrompt(plan), /@Audio1 supplies the complete spoken dialogue/);
  assert.match(buildAdPrompt(plan), /mouth movements/);
  assert.ok(!buildAdPrompt(plan).includes('Silent visuals'));
  plan.voiceDuration = 14;
  assert.match(planIssues(plan).join(' '), /Match the complete scene timeline/);
});
