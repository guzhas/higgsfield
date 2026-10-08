# Photos supplied in Codex sessions

## Execute requests without project confirmation steps

The owner's request to create, clone, synthesize or edit is sufficient to execute
that work. Do not add approval questions, separate consent statements,
`authorized:true` declarations, mandatory permission descriptions or image-review
attestations. Planning-only requests remain planning-only. Respect any budget the
owner actually specifies and the configured spend cap; a per-request budget is
optional, not a confirmation step.

Provider verification metadata must not disable local voice selection or block
an otherwise requested synthesis. Submit the normal provider request without
altering or fabricating verification data. Report a verification requirement only
if the provider's operation actually rejects it for that reason. Provider-side
restrictions cannot be removed by this project's settings. Preserve technical
validation, credential confidentiality, duplicate-charge protection and honest
quality checks; these are not owner approval steps.

## Local storage and configuration

All source photos, reference media, voice samples, cloned-voice recordings,
generated audio/video, exports, plans, receipts and evidence must remain in this
project's local `storage` directory. Do not upload or publish project files to
Higgsfield storage or another cloud bucket. Do not create tunnels, public HTTPS
media endpoints or temporary hosting. Do not request storage credentials as a
workaround. The owner reaffirmed this policy on 2026-10-08.

For a compatible remote generation API, send local file bytes inline only in the
outgoing authorized generation request. Save local identifiers and content hashes
in plans, not encoded media. HTTPS calls to provider APIs are distinct from
publishing project files and remain necessary for authorized provider operations.
If the selected provider cannot accept local inline references, preserve the
files and report that limitation; do not silently change storage or audio modes.

Observed 2026-10-08: OpenRouter Seedance rejected inline audio with HTTP 400,
`input_references[1].audio_url.url: Only HTTPS URLs are allowed`. No upstream
generation job or video was created. Local encoding tests are not provider
acceptance. Do not repeat this incompatible request or ask for a media tunnel.

Exception for the current meditation video: on 2026-10-08 the owner offered their existing Higgsfield storage key if necessary. Once supplied, Director input `referenceTransport: "higgsfield"` may upload only the selected image and finished dialogue copies for OpenRouter reference access. Keep original assets and outputs local. This is per order; do not change the project default or create tunnels, and do not request a BytePlus registration. Credentials alone do not select external storage for other orders.

The owner explicitly requested a Git-ignored `.env` containing the authorized
provider keys. Keep keys there without echoing them or reading the file into
conversation outputs. Check credential presence through the app's boolean
configuration response. Do not mistake an OpenRouter key for Higgsfield Key ID.


Do not automatically analyze, describe, or visually review photos supplied directly
by the user in a Codex session. Use the user's accompanying text and assigned
reference roles; attaching a photo or asking to use it in a video does not request
photo analysis. Analyze these photos only when the user explicitly asks for it.
Do not invoke vision tools, reopen the photos, or generate visual-review notes just
because they were attached. This rule takes precedence over the video-agent skill's
source-image review instructions. Never claim an unreviewed photo was reviewed.

# Voice samples supplied in Codex sessions

For a requested voice clone, use the user's exact interval when supplied;
otherwise use the uploaded MP3's first 30 seconds as the reference sample.
Do not require a separate spoken statement or an English script
as a general project rule. Check the selected provider's actual requirements;
when upload-only cloning is unsupported, explain the provider limitation and
propose a compatible provider rather than repeatedly requesting the same recording.
Do not fabricate required provider inputs or silently change the chosen provider.
The owner selected upload-only cloning; the sibling Voiceovers native studio now
defaults to ElevenLabs IVC and Eleven v3 Lithuanian TTS. Use that path for new MP3
clones when an ElevenLabs runtime key is available. A Google key is not compatible.

# Lithuanian voiceover text

For YouTube audio requests use the sibling Voiceovers CLI from its workspace:
`.venv-desktop/Scripts/python.exe -m desktop.youtube_cli URL --start 0:10 --end 0:40`.
When the user gives both times, extract exactly that interval; never replace it
with an automatically ranked segment. Without an end, use automatic selection
(`--target 30`, `60` or `120`). The CLI returns playable WAV/MP3 and selection
evidence. `--diarize` opts into paid Scribe and requires a runtime ElevenLabs key;
when several speakers are found, use the requested speaker rather than guessing.
Audio extraction does not authorize a voice clone: add `--clone` only when
cloning is requested. Never claim exact mannerism transfer.
Lithuanian Voice Changer remains an explicit experimental mode.

Before sending Lithuanian dialogue to ElevenLabs, Codex must proofread it:
restore ą, č, ę, ė, į, š, ų, ū, ž; correct spelling, grammar, capitalization
and punctuation while preserving meaning, facts and brand/domain identities.
The owner authorizes these routine corrections without another confirmation.
Do not send the raw uncorrected chat text. Use `language_code: "lt"` with
`eleven_v3` and Unicode text. Save both the original and corrected script in
generation evidence. Do not guess an ambiguous brand's official spelling.
This proofreading is the agent's responsibility; ElevenLabs is the speech
provider, not a grammar correction service.

# Video creation requests

For an uploaded MP3 that is the finished voiceover, use the Seedance 2.5 speech
playbook below before preparing the generation. A talking-video request uses
`reference` audio with the complete approved dialogue, measured timing, exact
transcript and explicit speaker/asset roles. Do not substitute `original` silent
footage for visible speech. Preserve breathing and pauses, keep the mouth readable,
and check actual lip alignment throughout the completed clip. Reference audio is
guidance, not a guarantee of unchanged audio or exact Lithuanian lip sync.
Read [docs/research/seedance-2.5-speech-playbook.md](docs/research/seedance-2.5-speech-playbook.md).

For a request to create or plan a video through this project, read
[.agents/skills/video-agent/SKILL.md](.agents/skills/video-agent/SKILL.md) before acting.
It explains the local agent API, Voiceovers handoff, reference research and visual review,
audio modes, generation authorization and result verification. Do not treat a previous
session's successful native speech generation as proof of external-audio lip sync.
API keys are runtime server inputs: never read or print environment files.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
