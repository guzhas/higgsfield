import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDirectorInput, composeDirectorPrompt, prepareDirector } from './director';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ASSET_DIR,readAsset,saveAsset,assetPath} from './reference-assets';
import {localAssetUrl} from './local-reference-id';
import { acceptedCommonsLicense, commonsMediaUrl } from './director-location';
import { referenceInputs } from './video-references';
import type { DirectorInput } from './director-contract';
import type { SceneAcoustics } from './scene-audio';

test('creator carries outdoor perspective to the prompt without requesting duplicate sea audio',()=>{
  const acoustics:SceneAcoustics={space:'open_air',microphone:'phone_camera',distanceMeters:2,referenceContent:'mixed',ambienceMode:'preserve_reference',referenceAcoustics:'unknown'};
  const parsed=parseDirectorInput({...input,acoustics});
  const prompt=composeDirectorPrompt(parsed,'A speaker sits on a quiet beach.',input.dialogue,20,[{kind:'audio',url:'https://example.com/approved-mix.wav',duration:20}]);
  assert.match(prompt,/Open-air acoustics/);assert.match(prompt,/phone microphone approximately 2 m/);
  assert.match(prompt,/Do not add a second ambience layer/);
  assert.ok(!prompt.includes('The TTS reference is a dry voice track'));
  assert.throws(()=>parseDirectorInput({...input,acoustics:{...acoustics,referenceAcoustics:'roomy'}}),/kambario aidas/);
  assert.throws(()=>parseDirectorInput({...input,voiceMode:'clone',voiceId:'permitted_voice',acoustics}),/TTS pateikia balsą/);
  assert.equal(parseDirectorInput({...input,voiceMode:'silent',dialogue:'',acoustics:{...acoustics,referenceAcoustics:'roomy'}}).acoustics,undefined);
});

const input:DirectorInput={requestId:'12345678-1234-4234-a234-123456789abc',concept:'Street interview',dialogue:'Em... Aš rūpinuosi savo grožiu.',language:'lt',voiceMode:'recording',voiceId:'',recordingAssetId:'12345678-1234-4234-a234-123456789abd',location:'Vilnius Cathedral Square',locationMode:'real',weather:'Overcast',environment:'Distant pedestrians',camera:'Eye-level medium shot',aspectRatio:'9:16',resolution:'720p',duration:20,minimumLocationReferences:3,references:[]};
test('an explicitly selected storage copy preserves the original local asset and never submits video',async()=>{
  const originalFetch=globalThis.fetch,envNames=['HF_API_KEY_ID','HF_API_KEY_SECRET','OPENROUTER_API_KEY'];
  const originalEnv=envNames.map(n=>process.env[n]);
  envNames.forEach(n=>process.env[n]='test-only');
  const assetId=randomUUID(),requestId=randomUUID(),bytes=Buffer.from('synthetic transport fixture');
  const source={assetId,filename:assetId+'.png',kind:'image' as const,mime:'image/png',url:localAssetUrl(assetId),localUrl:'/api/reference-assets/'+assetId,width:720,height:1280,bytes:bytes.length};
  fs.mkdirSync(ASSET_DIR,{recursive:true});fs.writeFileSync(assetPath(source),bytes);saveAsset(source);
  const files=[assetPath(source),path.join(ASSET_DIR,assetId+'.json'),path.join('storage/director',requestId+'.attempt.json')];
  let uploads=0,videoPosts=0;
  globalThis.fetch=(async(url,init)=>{
    const target=String(url);
    if(target.endsWith('/chat/completions'))return Response.json({choices:[{message:{content:JSON.stringify({scene:'Use the complete supplied scene.',correctedDialogue:'',locationQuery:'beach'})}}]});
    if(target.endsWith('/files/generate-upload-url'))return Response.json({upload_url:'https://storage.example/upload',public_url:'https://storage.example/reference.png'});
    if(target==='https://storage.example/upload'){uploads++;assert.deepEqual(Buffer.from(init?.body as ArrayBuffer),bytes);return new Response(null,{status:200});}
    if(target.endsWith('/videos/models'))return Response.json({data:[{id:'bytedance/seedance-2.5',supported_durations:[20],supported_resolutions:['720p'],supported_aspect_ratios:['9:16'],supported_sizes:['720x1280'],pricing_skus:{video_tokens:'0.0000107'}}]});
    if(target.endsWith('/videos')&&init?.method==='POST')videoPosts++;
    throw Error('Unexpected provider call');
  }) as typeof fetch;
  try{
    const prepared=await prepareDirector(parseDirectorInput({...input,requestId,referenceTransport:'higgsfield',voiceMode:'silent',dialogue:'',references:[{assetId,role:'scene',instruction:'Complete scene'}],autoGenerateReferences:false}));
    const planPath=path.join('storage/director',prepared.id+'.json');files.push(planPath,path.join('storage/director',prepared.id+'.direction.json'));
    const plan=JSON.parse(fs.readFileSync(planPath,'utf8')),copy=readAsset(plan.generationRequest.references[0].assetId);
    files.push(assetPath(copy),path.join(ASSET_DIR,copy.assetId+'.json'));
    assert.notEqual(copy.assetId,source.assetId);assert.equal(copy.url,'https://storage.example/reference.png');
    assert.deepEqual(fs.readFileSync(assetPath(copy)),bytes);
    assert.deepEqual(readAsset(source.assetId),source);assert.deepEqual(fs.readFileSync(assetPath(source)),bytes);
    assert.equal(uploads,1);assert.equal(videoPosts,0);assert.equal(prepared.input.referenceTransport,'higgsfield');
  }finally{
    globalThis.fetch=originalFetch;envNames.forEach((n,i)=>{if(originalEnv[i]===undefined)delete process.env[n];else process.env[n]=originalEnv[i];});
    for(const file of files)if(fs.existsSync(file))fs.unlinkSync(file);
  }
});
test('complete-scene guidance preserves the background and audio; pinned frames cannot hide cloned audio',()=>{
  const firstFrameAssetId='12345678-1234-4234-a234-123456789abe';
  const parsed=parseDirectorInput({...input,references:[{assetId:firstFrameAssetId,role:'scene',instruction:'Complete opening scene'}],autoGenerateReferences:false});
  const prompt=composeDirectorPrompt(parsed,'A seated presenter speaks.',input.dialogue,20,[{kind:'audio',url:'https://example.com/dialogue.wav',duration:20}]);
  assert.match(prompt,/complete-scene image reference supplies the opening composition/);
  assert.match(prompt,/rather than a pinned first frame/);
  assert.match(prompt,/@Audio1 supplies the complete spoken dialogue/);
  assert.ok(!prompt.includes('not their original backgrounds'));
  assert.throws(()=>parseDirectorInput({...input,firstFrameAssetId}),/pirmenybę/);
  assert.equal(parseDirectorInput({...input,voiceMode:'silent',dialogue:'',firstFrameAssetId}).firstFrameAssetId,firstFrameAssetId);
  for(const bad of [{firstFrameAssetId:'invalid'},{firstFrameAssetId,autoGenerateReferences:true},{firstFrameAssetId,references:[{assetId:firstFrameAssetId,role:'face',instruction:'Appearance'}]}]) assert.throws(()=>parseDirectorInput({...input,...bad}));
});
test('creator validates durations, roles and required media before AI or paid work',()=>{
  assert.deepEqual(parseDirectorInput(input),input);
  assert.equal(parseDirectorInput({...input,referenceTransport:'higgsfield'}).referenceTransport,'higgsfield');
  assert.equal(parseDirectorInput({...input,referenceTransport:'local_inline'}).referenceTransport,'local_inline');
  assert.throws(()=>parseDirectorInput({...input,referenceTransport:'public_tunnel'}));
  for(const bad of [{...input,recordingAssetId:''},{...input,duration:31},{...input,minimumLocationReferences:0},{...input,voiceMode:'clone',voiceId:''},{...input,references:[{assetId:input.recordingAssetId,role:'unknown',instruction:''}]},{...input,references:[{assetId:input.recordingAssetId,role:'face',instruction:'x'.repeat(281)}]}]) assert.throws(()=>parseDirectorInput(bad));
  assert.equal(parseDirectorInput({...input,voiceMode:'silent',dialogue:'',recordingAssetId:''}).voiceMode,'silent');
});
test('reference roles remain per media type and finished dialogue timing is not rounded in the edit',()=>{
  const refs=[{kind:'image' as const,url:'https://example.com/face.jpg',purpose:'Appearance only'},{kind:'image' as const,url:'https://example.com/microphone.jpg',purpose:'Microphone only'},{kind:'audio' as const,url:'https://example.com/dialogue.wav',duration:19.52,purpose:'Complete spoken dialogue'}];
  const prompt=composeDirectorPrompt(input,'One speaker answers a question.',input.dialogue,19.52,refs);
  assert.match(prompt,/@Image2: Microphone only/);assert.match(prompt,/@Audio1 supplies the complete spoken dialogue/);
  assert.match(prompt,/20-second/);assert.match(prompt,/ending to 19.52s/);assert.ok(prompt.includes(input.dialogue));
  assert.match(prompt,/breathing and hesitation timing/);assert.match(prompt,/Do not add a second ambience layer/);
  assert.deepEqual(referenceInputs(refs).at(-1),{type:'audio_url',audio_url:{url:'https://example.com/dialogue.wav'}});
  const silent=composeDirectorPrompt({...input,voiceMode:'silent',locationMode:'fantasy'},'Cloud city','',10,refs.slice(0,2));
  assert.match(silent,/fictional environment/);assert.match(silent,/Silent footage/);assert.ok(!silent.includes('DIALOGUE'));
  assert.ok(!silent.includes('Follow the complete recorded speech'));
  const clone=composeDirectorPrompt({...input,voiceMode:'clone'},'Outdoor interview',input.dialogue,19.52,refs);
  assert.match(clone,/dry voice track/);assert.match(clone,/quiet environmental sounds explicitly requested/);
});
test('location research accepts reusable licenses and rejects arbitrary image destinations',()=>{
  for(const license of ['CC BY-SA 4.0','CC BY 3.0','CC0','Public domain'])assert.equal(acceptedCommonsLicense(license),true);
  for(const license of ['All rights reserved','CC BY-NC 4.0','Unknown',''])assert.equal(acceptedCommonsLicense(license),false);
  assert.equal(commonsMediaUrl('https://upload.wikimedia.org/wikipedia/commons/a/a1/photo.jpg'),'https://upload.wikimedia.org/wikipedia/commons/a/a1/photo.jpg');
  assert.equal(commonsMediaUrl('https://thumb.wikimedia.org/wikipedia/commons/a/a1/photo.jpg'),'https://thumb.wikimedia.org/wikipedia/commons/a/a1/photo.jpg');
  for(const url of ['http://127.0.0.1/private','https://example.com/photo.jpg','https://upload.wikimedia.org.evil.test/wikipedia/commons/a.jpg','https://secret@upload.wikimedia.org/wikipedia/commons/a.jpg'])assert.throws(()=>commonsMediaUrl(url));
});
