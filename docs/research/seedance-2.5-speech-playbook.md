# Seedance 2.5 speech and lip-sync playbook

Checked 2026-10-08. This guide distinguishes published capabilities, this project's implementation and production recommendations. No billable research generation was performed. The actual later OpenRouter attempt rejected local-inline audio with HTTP 400; no video was created. All files stay local; cloud storage, tunnels and public media endpoints are forbidden. The machine-readable evidence and request example are in `seedance-2.5-audio-lipsync-2026-10-08.json`.

## What is established

For environmental sound, microphone perspective and room-like source audio,
also apply the [scene-acoustics research](seedance-2.5-scene-acoustics-2026-10-08.md).
Adding ambience does not establish outdoor voice acoustics.

The [official model tutorial](https://docs.byteplus.com/es/docs/modelark/seedance-2-5) lists native speech in Chinese, English, Spanish, Indonesian, Malay, Thai, Arabic, Portuguese, Vietnamese, Japanese and Korean. It describes audio-only reference input and videos up to 30 seconds. This is not an all-language guarantee. Lithuanian is not listed; do not describe it as verified or categorically impossible.

[OpenRouter's submission API](https://openrouter.ai/docs/api/api-reference/video-generation/submit-a-video-generation-request) accepts typed image, video and audio `input_references`. Audio handling depends on the provider. `generate_audio:true` requests output audio; it does not lock an uploaded recording. The reviewed API provides no forced-alignment or immutable-soundtrack switch. Use the [live model catalog](https://openrouter.ai/api/v1/videos/models) rather than the generic schema for model-specific resolution and duration. On the checked date this route listed integer 4–30s and 480p/720p for `bytedance/seedance-2.5`.

The [direct BytePlus API](https://docs.byteplus.com/zh-CN/docs/modelark/create-video-generation-task-api?redirect=1) uses a different `content` structure with media roles. It documents WAV/MP3 audio of 2–30s per file, up to 10 audio files, 30s total and 15MB each. Those upstream ceilings do not imply that this application's narrower one-dialogue-WAV workflow implements every combination. First/last-frame input and omni reference modes are separate API scenarios.

The [official prompt guide](https://docs.byteplus.com/vi/docs/modelark/seedance-2-5-prompt-guide?redirect=1) distinguishes semantic references from locked edit/frame tasks. It recommends assigning asset responsibilities and supplying complete character dialogue/timing. It acknowledges translation problems such as residual source speech, incorrect character voices and inaccurate mouth movement. Audio artifacts and unwanted subtitles/music are also possible. Its examples requesting precise lip sync are instructions, not measured guarantees. Some BytePlus pages render JavaScript shells; the relevant official alternate-locale pages were available through indexed text. No claim is made that every page loaded fully in a browser.

## Choose the required outcome first

| User requirement | Workflow | What must be checked |
| --- | --- | --- |
| New voice with visible speaking | Native audio and verbatim dialogue | Pronunciation, exact words, voice assignments and visible lip sync |
| Prepared spoken soundtrack with visible speaking | Completed WAV as audio reference; generated output audio | All of the above, plus fidelity to the supplied voice and timing; experimental here |
| Preserve the approved recording with no visible speech | Silent visuals; add original WAV locally | Correct edit timing and audible recording; MP4 uses AAC encoding |
| Ambience/music without speech | Native soundscape and empty dialogue | No invented narration; correct sound design |
| Music-only reference, motion reference, translation/edit/extension | Inspect current Studio/provider capabilities | Do not force these into the v1 dialogue brief or invent fields |

A voice-enrollment sample is not the finished script. Neither an MP3 filename nor a YouTube URL tells the agent which role a recording has. Resolve the role, authorization and required output before uploading. Source consent/enrollment recordings never belong in the video model packet.

## Recommended preparation sequence

These are production recommendations, not additional documented model controls:

1. Keep the final spoken text separate from camera/action directions. Retain original script, punctuation, diacritics and exact names. Resolve whether prices, URLs and abbreviations should be spoken as written or in a user-approved spoken form. Do not silently translate or transliterate an unknown language.
2. Select a permitted voice or generate a new synthetic one. Voice cloning and language pronunciation are separate capabilities: a stored profile does not prove that TTS handles a requested language. Inspect the current voice application's limits. In this project's sibling browser TTS, a request currently contains at most 260 characters; longer scripts need consistent fragments and local concatenation.
3. Create the actual complete spoken recording. Listen to it, compare a transcript with the approved script and verify names, language, speaker count and delivery. For an unfamiliar language, obtain a competent listener's assessment when available; do not replace this with an unsupported assurance from ASR.
4. Measure the recording with ffprobe and retain its original bytes. The local import format is mono PCM16 WAV at 24kHz, 5–30s. This is an application contract, not a Seedance-wide sample-rate requirement. Include meaningful pauses; do not accelerate speech automatically to meet a guessed duration.
5. Plan the picture around those measured times. A continuous short monologue can use one complete generation. Split longer scripts at natural pauses; do not cut a word across requests. Reuse identity, wardrobe, scene and lighting descriptions across clips, and expect possible drift. Five-second clips are not inherently better than one 20-second request.
6. Assign compatible character/location/product images clear roles. Inspect externally sourced reference pixels; photos supplied directly by the user are exempt from automatic analysis under AGENTS.md, unless the user explicitly requests it. Never invent a review for them. A character photo describes appearance, a location photo describes geometry, and the WAV supplies the spoken performance. Do not flood the request with contradictory views. A face reference is optional for a newly invented presenter; provider portrait rules still apply.
7. For a speaking shot, keep the mouth readable: medium or close framing, modest movement, minimal occlusion and enough time for articulation. Choose elaborate camera moves only when they support the requested scene. For multiple speakers, explicitly associate each line/time range with a visible character and keep the non-speaking characters silent.
8. Request `ceil(actualSeconds)` from the model. Preserve fractional edit duration and trim the ending hold rather than stretching the WAV. For reference mode the inline audio bytes must have the same bytes and duration as the approved local recording.

## Uploaded-dialogue checklist (implementation checked 2026-10-08)

1. Distinguish a finished voiceover MP3 from a voice-cloning sample. A finished
   recording does not need cloning or TTS again. Decode to the local PCM16 mono
   24kHz WAV contract without changing speed; retain the source and measured
   duration. Do not discard silence that carries intended pauses or breathing.
2. Use the approved full dialogue and transcript in one reference-mode request
   when within the app's 5–30s import limit. The official prompt guide recommends
   5–10s for subject audio/video references; that is not an instruction to truncate
   a longer completed monologue. For recordings over 30s, plan separate complete
   utterances at natural pauses, with consistent identity and location.
3. Map appearance, location and complete dialogue separately to the numbered
   assets. Use a language-labelled dialogue section and `{}` dialogue notation.
   Treat delivery tags as non-spoken instructions. Specify which visible person
   owns each recorded voice; a single interview should keep one speaker.
4. Request words, pronunciation, accent, emotion, breaths and hesitation timing
   from the recording. Keep the mouth readable during speech, use relaxed lips
   during non-speech pauses, and keep listeners silent. Restrained framing/head
   motion is production guidance; it is not a documented synchronization control.
5. Prefer a clean finished dialogue for a new recording; keep an already approved
   outdoor mix when requested. Do not silently denoise, replace or strip its
   ambience. Default reference audio policy keeps existing ambience and requests
   no added second layer, music or competing voices. Repeat this audio policy near
   the start and end, as the official guide recommends for unwanted music. An
   explicit `audio.soundscape` remains authoritative.
6. Keep the local bound WAV byte-identical to the import, use mixed references and
   `generate_audio:true`, match edit time to PCM frames and round only model
   duration upward. Do not invent `lip_sync`, forced-alignment, `draft`, native
   BytePlus roles or adaptive-duration fields in the OpenRouter payload.
7. Review the saved result's entire speech: words, pronunciation, voice, pauses,
   breathing, visible lip/jaw movement and speaker assignments. Inspect doubtful
   sections slowly. Record pass/fail/not-reviewed, never infer quality from HTTP
   acceptance. Do not conceal a mismatch by replacing the generated audio.

Rechecked official indexed [prompt-guide text](https://docs.byteplus.com/ko/docs/modelark/seedance-2-5-prompt-guide)
and [tutorial](https://docs.byteplus.com/id/docs/modelark/seedance-2-5), plus the
[OpenRouter submission schema](https://openrouter.ai/docs/api/api-reference/video-generation/submit-a-video-generation-request).
BytePlus pages sometimes return only a JavaScript shell when opened; the indexed
official text supplied the prompt recommendations. Direct BytePlus now documents
draft-to-final reuse and a portrait-specific workflow; neither is integrated into
this app's OpenRouter agent route. Do not promise direct upload of a real-person
face is accepted or treat a 480p OpenRouter attempt as a reusable native draft.

## Prompt example

This example is authored production guidance. Replace placeholders with actual evidence and exact dialogue; placeholder URLs and timings are not ready inputs.

```text
REFERENCE ROLES
@Image1: Presenter appearance only; do not copy the photo background.
@Image2: The selected camera background and architectural geometry.
@Audio1: Complete approved spoken dialogue, not a voice-enrollment sample.

Create a [duration]-second [ratio] original scene in [visual style].
SUBJECT AND LOCATION: [appearance, wardrobe, position, actual viewpoint].
TIMELINE: [measured action/camera beats and speaker assignments].
DIALOGUE ([requested language], verbatim): [exact approved transcript].
Use @Audio1 for words, pronunciation, delivery, speech order and pauses.
Match the visible speaker's mouth articulation to the recording. Keep the
mouth still during pauses and other characters silent during this speaker's
lines. Preserve the spoken language and voice; no paraphrases, repeated or
extra words. Keep the speaking face readable throughout those lines.
AUDIO DESIGN: [requested ambience/music or dialogue-only instruction].
FINISH: [visual treatment and exclusions relevant to this order].
```

Asset numbering is per media type, following submission order: the second image is `@Image2` regardless of where the audio appears in the array. The direct guide also recommends braced dialogue, parentheses for music and angle brackets for effects, with the spoken language identified. These are prompt notation, not JSON/API fields. The compiler uses explicit labelled sections; rewriting notation cannot create a missing synchronization API.

OpenRouter input example:

```json
{
  "model": "bytedance/seedance-2.5",
  "prompt": "The complete scene direction, numbered reference roles and exact transcript go here.",
  "duration": 20,
  "resolution": "720p",
  "aspect_ratio": "9:16",
  "generate_audio": true,
  "input_references": [
    {"type": "image_url", "image_url": {"url": "https://example.com/approved-scene.jpg"}},
    {"type": "audio_url", "audio_url": {"url": "https://example.com/complete-dialogue.wav"}}
  ]
}
```

The HTTPS example above describes the provider schema, not an allowed project hosting workflow. This project sends local bytes inline only. OpenRouter currently rejects inline audio; do not publish media or create a tunnel to work around it. Direct BytePlus uses `content` and `role:reference_audio`; Higgsfield has its own reference-to-video schema. Do not copy either payload unchanged into OpenRouter. A model seed does not guarantee cross-provider reproducibility or exact speaker identity.

## Acceptance and failure handling

API acceptance establishes transport only. A completed job with a playable saved file establishes generation only. Quality requires a separate review of the actual result.

For each generated speech clip, retain a small local review record: provider/model/date, language and dialect, source WAV hash, exact transcript, requested/actual duration, job ID, and pass/fail/not-reviewed for words, pronunciation, speaker/voice fidelity, pause timing, visible mouth alignment, image continuity and requested actions. Inspect speaking sections throughout the clip, not only three thumbnails. Listen once in real time and inspect doubtful articulation slowly. ASR can miss names and cannot establish voice identity or lip alignment. A forced-alignment tool could help locate words, but none is installed by this workflow and it would not prove visual alignment alone.

Do not replace generated audio with the original WAV to conceal a failure. A replacement preserves the words but may break the generated mouth timing. If the user requires an unchanged soundtrack and the reference result alters it, record failure. A separately researched and tested audio-driven lip-sync stage would then be needed; it is not currently integrated. Do not claim support for every world language from one successful sample.

When a required check fails, report the concrete defect. Keep successful assets and the existing job ID; do not retry paid work automatically. A new attempt needs the user's instruction. Moderation or a portrait restriction requires the supported provider workflow, not disguising the same material. If language quality remains unreviewed, label it unreviewed. The user chose to perform creative testing in a fresh session, so this research does not establish live external-WAV lip-sync quality.
