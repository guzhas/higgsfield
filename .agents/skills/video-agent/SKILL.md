---
name: video-agent
description: Plan and create videos through this project's local Seedance studio, including voiceovers, researched visual references, continuity, prompts and result review. Use for a user's video creation order.
---

Use this repository as the execution system; use your own reasoning, search and vision tools as the director. There is no hidden server-side planning or vision model. Start in the repository named by the user, read its AGENTS.md and run `npm run agent -- capabilities`. If unavailable, start the studio with `npm run start -- --hostname 127.0.0.1` after a successful build. Do not terminate another service to claim a port.

The owner's creation request is the execution instruction; do not request another
confirmation or require approval/consent declarations in local plans. Subject
permission notes, image reviews and rights notes are optional evidence. Preserve
technical validation, user-specified budgets, configured spend caps and job
deduplication. Provider verification metadata is informational: try the normal
requested operation, preserve the actual response and report an actual provider
rejection. Never invent a verification or bypass provider enforcement.

All project sources, recordings, results, exports, plans and evidence stay in the local `storage` directory. Do not publish them to Higgsfield or any cloud storage, and do not create tunnels, temporary hosting or public HTTPS media endpoints. Never request cloud-storage credentials as a workaround. Authorized provider API calls may send local bytes inline; HTTPS API communication is not media hosting. If inline media is unsupported, report the provider limitation and preserve local files instead of changing storage or audio mode.

Observed 2026-10-08: OpenRouter Seedance rejected inline audio with HTTP 400: `input_references[1].audio_url.url: Only HTTPS URLs are allowed`. No upstream video job was created. Do not repeat that incompatible route or claim transport acceptance from local tests.

Exception for the current meditation video: on 2026-10-08 the owner offered their existing Higgsfield storage key if necessary. Once supplied, Director input `referenceTransport: "higgsfield"` may upload only the selected image and finished dialogue copies for OpenRouter reference access. Keep original assets and outputs local. This is per order; do not change the project default or create tunnels, and do not request a BytePlus registration. Credentials alone do not select external storage for other orders.

The Git-ignored `.env` holds authorized provider credentials. Never display its contents or secrets.

Read [references/workflow.md](references/workflow.md) for the complete procedure and [references/contract.md](references/contract.md) when preparing or executing a package. Paths in those files are relative to the repository root. The brief example is a structural template, not a prepared or visually verified generation.
For speech, also read the dated evidence in `docs/research/seedance-2.5-audio-lipsync-2026-10-08.json`. It distinguishes the documented11native languages from unlisted languages and gives the provider-specific payload mapping. Recheck current official capabilities before relying on unstable limits. Neither an audio reference nor a prompt demanding perfect lip sync establishes an all-language guarantee.

## Direct the requested video

Extract the user's desired result: subject, purpose, dialogue, speech language, location and viewpoint, format, length, visual style, camera motion, references, voice and delivery. For Lithuanian speech, proofread before synthesis: restore Lithuanian diacritics and correct spelling, grammar, capitalization and punctuation. The owner authorizes routine linguistic corrections without another confirmation. Preserve meaning, facts, product and domain identities; do not invent a brand's spelling or change advertising claims. Save the original and corrected text in generation evidence, and send only the corrected text to ElevenLabs with `language_code: "lt"` and `eleven_v3`. This is agent proofreading, not an automatic grammar feature of ElevenLabs or the desktop text editor. Adapt to interviews, UGC, advertisements, demonstrations, silent scenes, documentary footage or animation. Ask only for information that matters and cannot be inferred; continue independent research while waiting. If the user asks for planning only, do not generate. A request to generate authorizes the needed routine execution; do not ask again just because a skill mentions review.

Photos supplied directly by the user in a Codex session are exempt from automatic source-image analysis: follow AGENTS.md and use the accompanying text and assigned roles without invoking vision or writing visual-review notes. Analyze them only if the user explicitly requests photo analysis; a request to use a photo in a video is not such a request. Never fabricate a vision review for an uninspected photo.

For other source images, inspect them with vision, not captions or search thumbnails alone. Record what each reference shows, its origin, rights and role. Evaluate viewpoint consistency, geography, recognizability, lighting and resolution; send enough compatible references to explain the shot, not every search result. Follow the user's required reference count; choose an appropriate count otherwise. An exterior tower image does not establish the view from its rooftop. Bind actual reviews to local image hashes after the final crop or resize.

Check the voice library before choosing a clone. For a new clone, use the exact user-selected interval, or the first 30 seconds of the uploaded MP3 when no interval was supplied. Do not require a separate statement or English script locally. Follow actual provider enrollment inputs without inventing them or silently switching providers. Verification metadata alone does not justify blocking TTS; the normal provider operation determines availability. Read the current dialogue WAV and manifest, not raw enrollment recordings, into the video workflow.


## Match audio to the requested result

For a voice that must sound physically in the filmed location, read
`docs/research/seedance-2.5-scene-acoustics-2026-10-08.md` from the repository root.
Use the validated `audio.acoustics` agent profile or `acoustics` director field.
Separate performance, microphone perspective and ambience responsibilities.
Do not describe a locally mixed TTS preview as Seedance output or treat a successful
noise-isolation request as proof of outdoor acoustics. A source rejected by the
user for room sound remains a failed source until a new listening review passes.

For user-uploaded MP3 voice clones, use the sibling native studio's ElevenLabs IVC path, which creates the clone from the first 30 seconds without a separate spoken statement. It requires an ElevenLabs runtime key; the owner's Google key cannot authenticate this provider. The adapter is `../Voiceovers/desktop/elevenlabs.py`, and its actual usage and limitations are in `../Voiceovers/desktop/README.md`. Do not route this request back into Google enrollment unless the user selects Google.

For YouTube, use `python -m desktop.youtube_cli` from the Voiceovers workspace.
User-supplied `--start 0:10 --end 0:40` means that exact interval; without an
end, the CLI selects a speech-rich 30/60/120 s sample within bounded windows.
`--diarize` opts into cached, paid Scribe speaker segmentation; choose the
requested speaker if several are found. Extraction returns WAV/MP3 and
`selection.json`, and does not create a clone unless `--clone` is specified.
Use only runtime credentials. Never claim exact delivery transfer from a voice
sample: the native Voice Changer needs a performance of the new words and its
Lithuanian mode is explicitly experimental.

For speech, audio-reference, multilingual or lip-sync requests, read `../../../docs/research/seedance-2.5-speech-playbook.md` and its linked evidence before compiling the package. Language documentation, a successful import and live lip-sync quality are separate findings.

Apply the playbook's uploaded-dialogue checklist for every finished MP3/WAV used
in a talking video. Keep the full approved soundtrack, speaker mapping, breathing
and pauses. The compiler shares reference-speech direction with the Studio ad
workflow, including a default policy against duplicating already-recorded ambience.
An explicit requested soundscape overrides that default. Review actual articulation
and speech timing before describing the result as synchronized.

- `native`: no existing voice required; Seedance generates the described speakers and approved script, or a non-speaking soundscape. Do not claim a generated voice matches a specific person.
- `reference`: use the completed approved local dialogue WAV as an inline reference, plus visuals, only on a provider that accepts this transport. Voice and timing are guidance; external-audio exact lip sync is unverified. Generate the entire short dialogue together.
- `original`: generate silent footage with no visible speaking; add the original soundtrack locally. This preserves the recording's content, with AAC encoding in the final MP4. It is not a lip-sync solution.
- `silent`: visuals only.

Do not silently substitute one audio workflow for another. A reference sample for voice enrollment is not the completed dialogue soundtrack. Match shot timings to measured audio, not a words-per-minute guess. For longer-than-30s orders, plan multiple clips with consistent references and combine locally; do not advertise that as one supported 60s model request.

## Execute and verify

Prepare an immutable agent package with source evidence, prompt, audio and timeline. Resolve its technical `blockers`; `ready` means structurally ready, not guaranteed visual quality. Review the compiled request and price automatically. A generation request needs no further confirmation or authorization file. An optional maximumUsd enforces a supplied budget, and the configured spend cap still applies. Same package ID always returns the same job, including after failure. Unknown outcomes must be checked by job ID before any new attempt. Never automatically retry moderation or create a different request to bypass it.

Report success only after terminal `completed` with a playable saved output. Check visuals at several timestamps, listen to the entire audio, compare the transcript and inspect visible mouth alignment when required. Distinguish accepted API parameters, generated media and quality observations. Explain what did not match; do not introduce a mandatory approval stage for the result. Return the actual local output; keep original sources and generation evidence under Git-ignored storage. Never read, print or commit API keys.
