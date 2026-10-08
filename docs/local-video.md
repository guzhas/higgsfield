# Local video rendering

The local renderers do not contact a generation provider, upload media, load API
keys, or create an HTTP endpoint. Keep their configurations, sources and outputs
under this project's Git-ignored `storage` directory. They are separate from the
OpenRouter Seedance workflow; do not label their outputs as Seedance generations.

## Photo montage with an existing soundtrack

Run from the repository root:

```powershell
node scripts/render-local-ad.mjs storage/agent-work/my-order/config.json
```

The JSON configuration contains `image`, `imageSha256`, `audio`, `audioSha256`,
`durationSeconds` (1–30), and `captions`, an array of `{start, end, text}` cues.
Paths point to existing local files. Use the complete approved soundtrack and
its measured timing. Caption text can contain newlines. Input hashes are checked
before rendering.

FFmpeg is resolved from `FFMPEG_PATH`, or the existing local imageio-ffmpeg runtime
under `storage/tools/audio-venv/Lib/site-packages/imageio_ffmpeg/binaries`.

Outputs are 720 × 1280 MP4s with a restrained push-in, with and without subtitles,
plus ASS captions and a JSON receipt containing source/output hashes. The supplied
audio is encoded as AAC without changing its speed or adding another ambience
layer. This workflow does **not** animate the person or generate lip sync.

To compose an already rendered local talking portrait, add an `animation` object
with `engine: "sadtalker"`, `file` and `sha256` to the same configuration. The
compositor then uses that animation, keeps the original opening photo at t=0,
dissolves into animation over 160 ms, and holds the final resting frame for the
soundtrack tail. It produces separate `meditacijos-reklama-kalbantis-local`
exports and `talking-render-evidence.json`, without overwriting the photo montage.

## Experimental local talking portrait

`scripts/run-local-talking-portrait.py` wraps the official
[OpenTalker/SadTalker](https://github.com/OpenTalker/SadTalker) CLI in CPU mode.
The engine, virtual environment, checkpoints and FFmpeg must first be installed
under `storage/tools`; they are not distributed in Git. The wrapper keeps engine
intermediates and caches inside `storage`, applies compatibility shims for older
imports, and requires local source/audio/output paths.

```powershell
storage/tools/sadtalker-venv/Scripts/python.exe scripts/run-local-talking-portrait.py `
  --source_image storage/agent-work/my-order/scene.png `
  --driven_audio storage/agent-work/my-order/dialogue.wav `
  --result_dir storage/agent-work/my-order/talking `
  --still --preprocess full --size 256 --batch_size 1 --verbose
```

This is a different local model, not an alternative Seedance API transport.
CPU runtime and visual quality must be measured on an actual result. A completed
process does not prove natural motion, unchanged identity or accurate mouth timing.
Keep a short test and review it before relying on a full advertising export.

The local Python 3.12 runtime uses CPU PyTorch 2.3.1, torchvision 0.18.1,
NumPy 1.26.4, Pillow 10.4.0, SciPy 1.12.0, librosa 0.9.2, BasicSR 1.4.2,
facexlib 0.3.0 and setuptools 75.8.0. Setuptools must retain `pkg_resources` for
this librosa version. The wrapper also applies the exact scalar conversion fix
needed by the engine's older NumPy alignment code.

Optional `--render-stride 2` or `3` computes fewer facial frames, then linearly
interpolates them back to the original 25 fps timeline; soundtrack speed and timing
stay unchanged. This trades fine articulation for CPU runtime. The frozen source
encoder is cached for the one immutable source image handled by the CLI.
Optional `--render-size 128` is an experimental preview using the 256 checkpoint.
The meditation-order test at 128 failed the visual articulation check; it must
not be treated as a validated advertising setting.
