import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSceneAcoustics, sceneAudioDirection, type SceneAcoustics } from './scene-audio';

const beach: SceneAcoustics = {space:'open_air',microphone:'phone_camera',distanceMeters:2,
  referenceContent:'mixed',ambienceMode:'preserve_reference',referenceAcoustics:'unknown'};

test('known room-sounding speech and doubled ambience are rejected before billable preparation',()=>{
  assert.deepEqual(parseSceneAcoustics(beach),beach);
  for(const bad of [
    {...beach,referenceAcoustics:'roomy'}, {...beach,ambienceMode:'generate_from_scene'},
    {...beach,referenceContent:'speech_only'}, {...beach,distanceMeters:NaN},
    {...beach,distanceMeters:0}, {...beach,reverbAmount:0.5},
  ]) assert.throws(()=>parseSceneAcoustics(bad));
  assert.equal(parseSceneAcoustics({...beach,space:'interior',referenceAcoustics:'roomy'}).space,'interior');
});

test('speech-only and mixed references have mutually exclusive environment responsibilities',()=>{
  const mixed=sceneAudioDirection(beach);
  assert.match(mixed,/phone microphone approximately 2 m/);
  assert.match(mixed,/Do not add a reverb plugin/);
  assert.match(mixed,/Do not add a second ambience layer/);
  assert.match(mixed,/do not reproduce source room echo/);
  const voiceOnly=sceneAudioDirection({...beach,referenceContent:'speech_only',ambienceMode:'generate_from_scene',soundscape:'Quiet small ocean waves.'});
  assert.match(voiceOnly,/<Quiet small ocean waves\.>/);
  assert.ok(!voiceOnly.includes('already contains the approved environmental sound'));
  const native=sceneAudioDirection({...beach,referenceContent:'speech_only',ambienceMode:'generate_from_scene'},false);
  assert.ok(!native.includes('Preserve reference words'));
  assert.match(native,/Generate speech and environment together/);
});
