# Agent execution contract

All project sources, recordings, results, exports, plans and evidence stay in the local `storage` directory. Do not publish them to Higgsfield or any cloud storage, and do not create tunnels, temporary hosting or public HTTPS media endpoints. Never request cloud-storage credentials as a workaround. Authorized provider API calls may send local bytes inline; HTTPS API communication is not media hosting. If inline media is unsupported, report the provider limitation and preserve local files instead of changing storage or audio mode.

Observed 2026-10-08: OpenRouter Seedance rejected inline audio with HTTP 400: `input_references[1].audio_url.url: Only HTTPS URLs are allowed`. No upstream video job was created. Do not repeat that incompatible route or claim transport acceptance from local tests.

Exception for the current meditation video: on 2026-10-08 the owner offered their existing Higgsfield storage key if necessary. Once supplied, Director input `referenceTransport: "higgsfield"` may upload only the selected image and finished dialogue copies for OpenRouter reference access. Keep original assets and outputs local. This is per order; do not change the project default or create tunnels, and do not request a BytePlus registration. Credentials alone do not select external storage for other orders.

Run the CLI from the repository root. It talks only to fixed local HTTP endpoints; credentials remain in the corresponding servers. It never loads `.env.local`. The marker `X-Video-Agent: studio-v1` and same-origin checks protect browser access; they are not authentication against local processes. Bind the studio to 127.0.0.1; do not expose these routes on LAN or hosting without an authentication layer.

## Commands

For scene-matched audio, the v1 brief accepts optional `audio.acoustics`:
`space` (`open_air`/`interior`), `microphone` (`phone_camera`/`close_mic`),
`distanceMeters` (0.1–15), `referenceContent` (`speech_only`/`mixed`),
`ambienceMode` (`generate_from_scene`/`preserve_reference`/`none`),
`referenceAcoustics` (`unknown`/`dry`/`roomy`) and optional `soundscape`.
These compile into prompt direction, not provider JSON parameters. Mixed
references must preserve their existing ambience; native generation cannot
preserve absent reference audio. Known room-like speech cannot be used for an
open-air request. `dry` is a listening assessment, never inferred from an
isolation/normalization success. See the dated scene-acoustics research.

```text
npm run agent -- capabilities
npm run agent -- voices replicated
npm run agent -- voices prebuilt
npm run agent -- upload-local storage/agent-work/order/image.jpg image/jpeg
npm run agent -- publish <local-asset-UUID>
npm run agent -- speech storage/agent-work/order/speech.json storage/agent-work/order/dialogue.wav
npm run agent -- import-voice storage/agent-work/order/dialogue.wav storage/agent-work/order/voice-manifest.json
npm run agent -- prepare storage/agent-work/order/brief.json
npm run agent -- inspect <plan-id> storage/agent-work/order/package.json
npm run agent -- submit <plan-id>
npm run agent -- submit <plan-id> storage/agent-work/order/options.json
npm run agent -- status <job-UUID>
```

`speech` and `submit` are billable and never automatically repeated. In this local workflow, `publish` only registers a local asset marker; cloud publication is forbidden. `upload-local`, `import-voice`, `prepare`, `inspect` and local status reads make no generation request. The human's request to generate can authorize routine uploads/TTS/one video request within that scope; planning-only requests do not. Never infer authorization from these examples.

The HTTP voice service is the sibling Voiceovers browser app at 127.0.0.1:3210. Desktop-only usage does not provide this API. Use its `Kurti video` button instead when appropriate. Do not send desktop enrollment samples/consent to the video server. TTS request example: `{ "text": "Exact approved dialogue.", "voice": "Puck", "style": "ugc", "direction": "Natural and calm delivery." }`; confirm supported style IDs and voice availability in the current sibling project.
The current browser speech fragment limit is260characters, not260words. A `speech` command produces one fragment; the agent must split longer text sensibly, combine completed fragments locally and create a full-text manifest before video import. Keep one profile/style and actual audio boundaries across fragments. The command does not promise word alignment, clone enrollment or an automatically running Voiceovers server.

`import-voice` takes a v1 manifest from `docs/voiceover-integration-v1.json`. Required fields: schemaVersion=1, source=voiceovers, unique sourceJobId, status=completed, text, language, durationSeconds. WAV must be real mono PCM16 24kHz, 5–30s and <=15MiB. An empty transcript is valid for transport; an agent talking package requires a matching verified transcript. Repeated identical imports return the same asset; modified content needs a new sourceJobId. Optional segment times are fragment boundaries, not phoneme alignment.

## Brief

Use `docs/agent-brief.example.json` as a complete no-reference structural example and `lib/agent-contract.ts` as the type definition. Unknown fields are rejected. All product/scene directions use English; retain exact spoken dialogue in the requested language and original script.

- `request`: original intent and output style; max12000 characters.
- `format`: aspectRatio 9:16,16:9 or1:1; resolution480p or720p.
- `subject`: kind fictional or authorized, description; `permission` is optional descriptive metadata, never a required approval declaration.
- `location`: name, viewpoint and required distinct-image count0–30. Use0 for an invented setting if no location evidence is needed. Respect a requested count; do not force three photos for every video.
- `dialogue`: exact text (empty for silent or non-speaking native soundscapes), language, delivery direction. Reference mode requires a verified spoken transcript; music-only references use Studio.
- `audio`: native/reference/original/silent, optional `soundscape` for generated ambience/music/effects. Original/silent modes require separate local sound editing for extra sound design. Reference/original requires `voiceoverImportId`; reference uses the approved local asset ID in `referenceAssetId`. Its bound bytes must match the local approved WAV exactly; submit only to a provider accepting inline audio.
- `scenes`:1–10 records containing duration, action, camera and optional `caption` for deterministic local editing. Each scene1–30s; total4–30s. Fractional edit timings are allowed. Dialogue is global, so reference-audio generation uses the full timeline in one request. Optional top-level `finishing` conveys visual treatment; unsupported demands remain model-dependent rather than guaranteed.
- `references`: up to30 uploaded images with `assetId`, `role`<=300characters and `usage` location/subject/product/style. `sourceUrl`, `provenance`, `rights` and `review` are optional evidence, not confirmation requirements. Do not put local paths, keys or enrollment files into the brief. When recording provenance, use the actual source; do not invent a URL or review.

When an image has an optional `review`, it contains `{sha256,method:"vision",reviewer,locationMatch,viewpointMatch,usable,observations}`. Obtain sha256 from the actual stored bytes; do not guess or describe an uninspected image as reviewed. The server checks supplied review hashes for integrity. Suitability observations are warnings, not approval gates. Subject/product/style assets do not count toward location minimums; identical image hashes cannot inflate the reference count.

## Package and job

POST `/api/agent/plans` with the brief returns a content-addressed package with id, status, blockers, warnings, prompt, generationRequest, adPlan, compositionUrl and generationStarted:false. GET `/api/agent/plans/<id>` recomputes file checks; modifying a file invalidates its review. Every bound local reference is checked through the same typed generation parser as Studio. `ready` does not imply language quality, faithful geography, ownership or successful lip sync. Read warnings before proceeding.

The agent-generated prompt is genre-neutral. Use `compositionUrl` for preview and `Review this video in Studio` for manual submission. Editing that prompt in Studio creates a separate generic generation workflow; the agent endpoint only submits the immutable package and handles deduplication. “Use timeline for local editing” copies its scene layout into the advertisement editor, without overwriting the current plan before the click.

POST `/api/agent/plans/<id>/generate` needs the client marker and no confirmation declaration. An empty body or `{}` executes the requested generation. Optional `{ "maximumUsd":2 }` bounds the estimate when a per-request budget is supplied; optional `humanRequest` records context and defaults to the plan's request. Legacy `authorized` booleans are accepted without creating a gate. Obtain and inspect the price automatically; do not ask for another approval. The configured spend cap still applies. Repeated identical plan submissions return the existing job ID, including failed jobs. A changed plan is a new chargeable attempt.

GET `/api/jobs/<job-id>` returns `{job}`. Only terminal completed with actual saved video output can be called generated successfully; pending/queued/in_progress/downloading remain unfinished. Failed/nsfw/canceled must be reported. Download/play local `/api/media/...` output from job.outputs; do not expose provider credentials. Completed output URLs do not prove correct speech or lip movement: perform the quality review in workflow.md. OpenRouter cancellation is unavailable; don't claim to cancel it by merely stopping polling.

## Current boundaries

The automatic packet compiler covers new short videos with reviewed image references and one complete optional dialogue WAV. General video motion references, fixed first/last frames, video editing/extension and more advanced media combinations are available only through the existing Studio/provider capabilities, not this v1 brief schema. Discover current support before choosing such workflows and report unsupported paths instead of sending invented fields. Search/vision/voice enrollment are external-agent/app steps, not autonomous tasks inside this HTTP server. No all-language or exact-lip-sync guarantee is implemented.
