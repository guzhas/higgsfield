import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Local composition only: no provider request or TTS. Animation, when supplied,
// must already be rendered locally; this compositor does not generate lip sync.
const [configPath] = process.argv.slice(2);
if (!configPath) throw new Error('Usage: node scripts/render-local-ad.mjs storage/path/config.json');
const storage = fs.realpathSync('storage');
function localFile(value) {
  const resolved = fs.realpathSync(path.resolve(value));
  if (!resolved.startsWith(storage + path.sep)) throw new Error('Media must be inside project storage.');
  return resolved;
}
const configFile = localFile(configPath);
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
const image = localFile(config.image), audio = localFile(config.audio);
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (hash(image) !== config.imageSha256 || hash(audio) !== config.audioSha256) throw new Error('Source media hash mismatch.');
const animation = config.animation ? localFile(config.animation.file) : null;
if (animation && (config.animation.engine !== 'sadtalker' || hash(animation) !== config.animation.sha256)) throw new Error('Local animation engine or hash mismatch.');
const seconds = Number(config.durationSeconds);
if (!(seconds >= 1 && seconds <= 30)) throw new Error('Duration must be 1-30 seconds.');
if (!Array.isArray(config.captions)) throw new Error('Captions must be an array.');
const directory = path.dirname(configFile);
const binaries = path.resolve('storage/tools/audio-venv/Lib/site-packages/imageio_ffmpeg/binaries');
const ffmpeg = process.env.FFMPEG_PATH || path.join(binaries, fs.readdirSync(binaries).find(name => /^ffmpeg.*\.exe$/.test(name)) || 'missing');
const basename = animation ? 'meditacijos-reklama-kalbantis-local' : 'meditacijos-reklama-local';
const output = path.join(directory, `${basename}.mp4`);
const fps = animation ? 25 : 30, frames = Math.ceil(seconds * fps);
const filter = `scale=1440:2560:force_original_aspect_ratio=increase,crop=1440:2560,zoompan=z='1+0.025*on/${frames-1}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=${frames}:s=720x1280:fps=${fps},setsar=1,format=yuv420p`;
function run(args) {execFileSync(ffmpeg, ['-hide_banner','-loglevel','error','-y',...args], {cwd:directory,stdio:['ignore','ignore','pipe'],timeout:300_000});}
if (animation) {
  // Keep the supplied opening photo at t=0, then dissolve into the local face
  // animation over 160 ms. Hold its final resting frame for the soundtrack tail.
  const scale = 'scale=1440:2560:force_original_aspect_ratio=increase,crop=1440:2560,setsar=1';
  const zoom = `zoompan=z='1+0.025*on/${frames-1}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=720x1280:fps=${fps}`;
  const composition = `[0:v]tpad=stop_mode=clone:stop_duration=${seconds},trim=duration=${seconds},setpts=PTS-STARTPTS,${scale}[animated];[1:v]${scale},format=rgba,fade=t=out:st=0:d=0.16:alpha=1[opening];[animated][opening]overlay=0:0:shortest=1,${zoom},format=yuv420p[video]`;
  run(['-i',animation,'-loop','1','-framerate',String(fps),'-i',image,'-i',audio,'-filter_complex',composition,'-map','[video]','-map','2:a:0','-t',String(seconds),'-c:v','libx264','-preset','fast','-crf','19','-c:a','aac','-b:a','192k','-movflags','+faststart',output]);
} else {
  run(['-i',image,'-i',audio,'-vf',filter,'-map','0:v:0','-map','1:a:0','-t',String(seconds),'-c:v','libx264','-preset','fast','-crf','19','-c:a','aac','-b:a','192k','-movflags','+faststart',output]);
}
const timestamp = value => {
  const cs = Math.round(value * 100);
  return `${Math.floor(cs/360000)}:${String(Math.floor(cs/6000)%60).padStart(2,'0')}:${String(Math.floor(cs/100)%60).padStart(2,'0')}.${String(cs%100).padStart(2,'0')}`;
};
const cleanText = text => {
  if (typeof text !== 'string' || /[{}]/.test(text)) throw new Error('Invalid subtitle text.');
  return text.replace(/\r/g,'').replace(/\n/g,'\\N');
};
const subtitles = `[Script Info]\nScriptType: v4.00+\nPlayResX: 720\nPlayResY: 1280\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: Dialogue,Arial,40,&H00FFFFFF,&H00FFFFFF,&H00281E16,&H60281E16,-1,0,0,0,100,100,0,0,1,2,1,2,52,52,175,1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n`;
const lines = config.captions.map(c => {
  if (!(c.start >= 0 && c.end > c.start && c.end <= seconds)) throw new Error('Subtitle timing outside clip.');
  return `Dialogue: 0,${timestamp(c.start)},${timestamp(c.end)},Dialogue,,0,0,0,,{\\fad(100,100)}${cleanText(c.text)}`;
});
fs.writeFileSync(path.join(directory,'captions.ass'),subtitles+lines.join('\n')+'\n','utf8');
const captioned = path.join(directory,`${basename}-subtitrai.mp4`);
run(['-i',output,'-vf','subtitles=captions.ass','-map','0:v:0','-map','0:a:0','-c:v','libx264','-preset','fast','-crf','19','-c:a','copy','-movflags','+faststart',captioned]);
const result = {status:'rendered',workflow:animation ? 'local_talking_portrait_composition' : 'local_photo_montage',facialAnimationGenerated:Boolean(animation),lipSyncQuality:animation ? 'unreviewed' : 'not_generated',seedanceUsed:false,mediaUploaded:false,voiceRegenerated:false,originalImageSha256:hash(image),originalAudioSha256:hash(audio),animation:animation ? {...config.animation,sha256:hash(animation)} : null,durationSeconds:seconds,width:720,height:1280,fps,outputs:[output,captioned].map(file=>({file,bytes:fs.statSync(file).size,sha256:hash(file)})),qualityReview:'pending'};
fs.writeFileSync(path.join(directory,animation ? 'talking-render-evidence.json' : 'render-evidence.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
