# ElevenLabs voiceover and ambience

Run `npm run voiceover -- request.json storage/agent-work/my-voiceover`.
This standalone audio workflow does not need OpenRouter or Higgsfield credentials.
Provide `ELEVENLABS_API_KEY` only in the process environment. Install FFmpeg on
PATH or set `FFMPEG_PATH` to its executable. Credentials are not written to evidence.

The request must contain proofread `text`, `originalText`, `voiceId` and
`language` (`lt` or `en`). Optional `synthesisText` can add Eleven v3 delivery
tags, preserving the exact spoken words. `speed` supports this workflow's bounded
0.7–1.2 range; `stability` supports 0–1. Eleven v3 has no Similarity control;
legacy `similarityBoost` input is recorded as ignored and is not sent to the API.
`targetSeconds` defaults to 20; speech is
never cut to fit that target. Speech longer than 30 seconds is rejected locally.

```json
{
  "voiceId": "YOUR_PERMITTED_VOICE_ID",
  "language": "lt",
  "originalText": "Skirk laiko sau.",
  "text": "Skirk laiko sau.",
  "synthesisText": "[serious] [calm] Skirk laiko sau.",
  "speed": 0.9,
  "targetSeconds": 20,
  "ambience": {
    "prompt": "Gentle small waves washing onto a quiet beach. Outdoor natural ocean ambience, no voices or music.",
    "durationSeconds": 20,
    "loudnessLufs": -34
  }
}
```

`ambience` is optional and makes a separate paid Sound Effects v2 request.
Its duration supports 0.5–30 seconds, with looping enabled. The local mix
normalizes speech to -16 LUFS and ambience to the selected quieter level
(-45 to -24 LUFS), fades the ambience and limits peaks. It adds no room reverb.
Delivery tags direct the model; listening is required to judge actual intonation.

Outputs include dry `voice.wav`/`voice.mp3`, separate `ambience.mp3`, and
`mix.wav`/`mix.mp3`. JSON evidence preserves the original and corrected script,
provider request IDs, hashes and separate paid-stage outcomes. Do not label this
direct output as a Voiceovers desktop import. When using a finished mix in a
video, explicitly prevent the video model from adding another ambience layer.

Completed stages reuse their saved audio. Changed requests need a new directory.
Rejected, pending or unknown stages never retry automatically: inspect provider
history first. A crash may leave `.voiceover.lock`; review the ledgers and provider
history before removing only that lock. Local remixing can then reuse completed
stages without another paid request. Files marked `not_listened` have not passed
an audible transcript or quality review.

Provider contracts checked on 2026-10-08:
[TTS](https://elevenlabs.io/docs/api-reference/text-to-speech/convert),
[Sound Effects](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert).

## Clean a room-sounding performance for an outdoor mix

Run `npm run voiceover:outdoor -- storage/agent-work/source storage/agent-work/outdoor`.
The source must be a completed voiceover directory with intact `voice.wav`,
`ambience.mp3` and their ledgers. This performs one paid
[Audio Isolation](https://elevenlabs.io/docs/api-reference/audio-isolation/convert)
request on the voice alone. It reuses the approved performance and existing
ambience, rather than making another TTS or sound-effect request.

The local processing reduces proximity bass and boxy mids, sets speech to
-19 LUFS using a fixed gain that preserves its dynamics, and leaves the original
ambience normalization/fades intact. It adds no room reverberation. Outputs
include the isolated `voice-clean.wav`, EQ'd `voice-outdoor.wav`, and a final
`mix.wav`/`mix.mp3`. Isolation is intended to reduce unwanted noise/reverb;
it cannot guarantee a particular outdoor microphone perspective. Judge the
actual sound by listening. Original files are preserved, and hash, duration and
peak checks guard the source and finished mix. Unknown paid outcomes do not retry.

An isolation/mix result is not proof of natural outdoor acoustics. See the
[Seedance scene-acoustics research](research/seedance-2.5-scene-acoustics-2026-10-08.md)
for the difference between performance, microphone perspective and ambience.
