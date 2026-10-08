# Zinho Automates

Creation requests execute without additional project confirmation steps. Voice
verification metadata does not disable local voice selection; the normal provider
operation determines availability. Agent generation accepts an empty options body
and optional `maximumUsd`; subject permission notes, image rights notes and visual
reviews are optional evidence. Technical validation, configured spend caps and
duplicate-job protection remain active. Provider-side requirements remain the
provider's responsibility and are reported from actual operation responses.

For standalone ElevenLabs speech with delivery tags and optional generated
background sounds, see [voiceover and ambience](docs/voiceover-ambience.md).

See the Lithuanian [Seedance 2.5 prompting research](docs/research/seedance-2.5-prompting.md)
for reference modes, voiceover workflows, original ad templates, provider differences,
and the remaining integration and generation checks (reviewed October 4, 2026).

## Ad creation workflow

Open **Ad planner** (`/ads`) to create a timed advertisement. Start with the
product identity, audience, UGC or cinematic style, output ratio and provider.
The default plan is three 5-second scenes, in 9:16 at 720p.

- Upload product/style/motion references and assign a purpose to each file.
  Seedance References uses mixed image, audio and video inputs, with per-type
  labels such as `@Image1` and `@Audio1`. Exact first/last-frame control is a
  separate mode in Video Studio (Higgsfield: first frame; OpenRouter: first/last
  frame); mode changes clear the previous attachments.
- Write the action, camera direction, exact speech and optional editing caption
  for each scene. Scene times remain contiguous. Short scenes generate at least
  4 seconds and the final edit trims the extra tail.
- Choose an original WAV/MP3 voiceover, model-generated speech or silent output.
  Original voiceover and locally uploaded editing clips stay on this computer.
  The voiceover is added directly in editing and is never sent to the model.
  This does not provide lip synchronization to that external recording.
- Check a scene's current price, then explicitly click **Generate scene**.
  Changed generation settings invalidate its previous quote. Completed clips
  attach automatically; failed, canceled and moderated jobs do not become results.
  Use saved Library clips or local MP4/MOV clips as alternatives.
- Export the final MP4 with exact scene trims, the chosen audio workflow,
  scene captions and a final CTA. Export is local and makes no API generation
  request. It preserves framing with padding, outputs 720p H.264/AAC at 24 fps,
  verifies duration and saves the result in Library.

Plans autosave in browser storage and can be downloaded as JSON. Exact prompt
timestamps, reference identity and model speech quality still require reviewing
the real generated output. Separate model requests can vary character or voice
identity. Lithuanian generated speech remains unverified.

Media inspection, MP3/MOV conversion, export and editing integration tests
require **FFmpeg and ffprobe on PATH**, or runtime `FFMPEG_PATH` and
`FFPROBE_PATH` pointing to their executables. On Windows, install from the official
distribution or run `winget install --id Gyan.FFmpeg -e` and restart your terminal
and app. Upload validation checks file signatures, media streams, size, image
dimensions, reference durations/counts and video frame rate. Local editing assets
can be up to 5 minutes; provider references must fit the stricter 2–30s limits.

Studio uses **Enter for a new line** and **Ctrl/Cmd+Enter to generate**. The
Generate button waits for a price or an explicit metered-price description.
Requests with unknown pricing are blocked while a spend cap is active. Pending
priced jobs reserve budget, using an atomic check when creating the job. The
cap uses estimates; final provider charges and fees can differ from them.

Run `npm run check:ads` with the local app running to check real local uploads,
MP3 conversion, a 15s edit, captions/audio, Library persistence and byte-range
playback. It generates synthetic test fixtures, removes its own test records
and makes no billable requests. `npm test` also tests the local renderer.

## UGC and advertising prompt library

Open **Prompts** for 40 original UGC/ad templates: hook–demo–CTA,
problem–solution, unboxing, routine, faceless demo, founder, FAQ, offer,
beauty, apparel, food, product hero shots, GRWM, ASMR, comment replies,
packing, organization, feature tests and niche product demonstrations. Fill the product, benefit,
spoken script and CTA fields. Templates use **15s, 720p, 9:16, audio on**;
Lithuanian speech is an unverified template target; it is not in the official
BytePlus list of documented languages. Review cost and attach your product image
in the studio before generating. Shorten the duration and script to reduce cost.

The library also includes 163 attributed prompts from the EvoLinkAI collection,
including its Commercial / Product category. Search by text/author, filter
categories, favorite prompts, customize text and save personal variants to SQLite.
Examples play in native video players, without X post embeds. A server route
resolves public X embed metadata for catalogue entries and caches the MP4 URL
and poster. Media streams from its original host and is not copied into the
repository. X's public metadata endpoint is undocumented and can change or
stop returning deleted/restricted videos; unavailable examples are labeled,
with the original source link below the card. No API key or generation is used.
The Prompts document uses a no-referrer policy because X's media host rejects
third-party referrers; this also applies to navigation from inside the app.

The Prompts page shows previews directly in a responsive card grid. Direct
video previews load near the viewport and play muted when hovering anywhere
on a card. Leaving the card pauses playback, including manually started videos;
moving to another card switches the preview to that card. Player controls
allow normal playback. Cards with media appear first, and **With video** filters
out templates without an example source. The count shows filtered versus total
entries: 163 upstream entries plus 40 original templates (203 before personal
prompts). Upstream includes some repeated cases; language editions repeat the
same collection. **Customize** opens the editor in a right-side
drawer; close it with the close button or Escape. It starts hidden.
See [third-party notices](THIRD_PARTY_NOTICES.md). `npm run prompts:sync`
refreshes the checked-in catalogue and license from upstream with format checks.

**Use in studio** restores a prompt without submitting it. **Save prompt** in
the composer saves text and model controls. Generated results have favorites,
copy prompt, save prompt and reuse settings actions. Reuse includes reference
URLs when present; re-upload expired references. Favorite results remain local.

Seedance 2.5 and Kling 3.0 Standard / Pro have **Compare provider prices**.
Quotes apply to one video, preserve supported shared controls, and explain
token billing/provider defaults. A lower price is not a guarantee of equal
quality. Switching providers preserves compatible controls and clears attachments
so their roles cannot silently change between providers.

## OpenRouter video provider

Set `OPENROUTER_API_KEY` in the private `.env`, restart the server, then select
**OpenRouter** on the Video page. Seedance 2.5 and Kling 3.0 Standard / Pro are
available alongside the existing Higgsfield models. Settings shows whether the
server has loaded the key; its value is never returned to the browser.

The worker saves each provider's request ID and resumes polling after restart.
OpenRouter video downloads are authenticated server-side and saved to the local
library. Price estimates use the live video model catalogue and exclude platform
fees and taxes. Once complete, the API's reported usage cost replaces the estimate.
Unsupported settings block OpenRouter submission. Video-reference input billing
has no reliable total quote here; the UI explicitly shows metered pricing. An
active spend cap blocks these unpriced requests.

Seedance supports a mixed **References** mode and a separate **First / last
frame** mode. Kling images fill the first-frame and then last-frame slots.
Seedance references use local-inline transport. The actual OpenRouter test on
2026-10-08 rejected inline audio because an HTTPS audio URL is required. A talking
video with the cloned recording cannot currently run through this local-only route. Other provider routes require their explicitly supported transport;
do not silently publish this owner's files to cloud storage. Submitted OpenRouter videos cannot be canceled here
because the public video API does not document a cancellation endpoint.

Run `npm test` for provider routing, pricing, lifecycle, and credential-boundary
checks, and `npm run build` to verify the production app. Neither command starts
a billable generation. Clicking Generate does.

Official reference: [OpenRouter video generation](https://openrouter.ai/docs/guides/overview/multimodal/video-generation).

## Seedance 2.5 SDK example

Enter `HF_CREDENTIALS=key-id:key-secret` locally in `.env.local`, then run
`npm run seedance`. This submits **one billable generation** using the official
`@higgsfield/client/v2` SDK: "A cinematic scene at sunset", 5 seconds, 720p,
16:9. The CLI waits and prints a video URL only after confirmed completion.
Credentials are loaded server-side with dotenv and are never printed.
`.env.local` is excluded by the existing `.env*` Git ignore rule.

The installed SDK poller does not recognize canceled requests, so the example
uses `subscribe` with `withPolling: false` and polls the status endpoint itself,
handling failed, canceled, and moderated requests explicitly. Submission retries
are disabled to avoid duplicate billable requests. If polling fails or times out,
check the request in the Higgsfield console before running it again.

The example saves a submission receipt under
`storage/sdk-seedance-2.5-check/receipt.json` and does not submit again when a
receipt exists. The live check on 2026-10-08 returned HTTP 403
(`NotEnoughCreditsError`: insufficient credits or access denied), with no
request ID or video URL. Setup is implemented; successful generation is not
verified. Higgsfield website subscriptions and the API dollar balance are
[separate billing products](https://higgsfield.ai/creator-hub/help-center/integrations/what-is-the-higgsfield-api).

This standalone example does not use SQLite. The web studio uses its existing
Settings credentials, `HF_API_KEY_ID` / `HF_API_KEY_SECRET`, or `HF_CREDENTIALS`.
On Windows, the studio's `better-sqlite3` dependency may require Visual Studio
C++ build tools; installing with `--ignore-scripts` can run the standalone SDK
example but does not verify the database-backed studio.

References: [official SDK documentation](https://docs.higgsfield.ai/docs/how-to/sdk)
and [Seedance 2.5 API reference](https://console.higgsfield.ai/models/bytedance/seedance-2.5/text-to-video/api-reference).

A self-hosted front end for the [Higgsfield API](https://docs.higgsfield.ai/docs). The same
composer-driven workflow as Higgsfield's own app, but billed per generation through your own
API key instead of a subscription.

The image/video registry combines historical live capability checks with
current provider documentation. New mixed-reference output quality still needs
real generation checks.

## Setup

You need **Node.js 20 or newer**. Check with `node -v`; if it's older, get the current
release from <https://nodejs.org>.

```bash
npm install
npm run build
npm start
```

Then open <http://localhost:3000>.

### Add your API key

The app ships without a key — you use your own, and you're billed only for what you generate.

1. Create an account at the **[Higgsfield Console](https://higgsfield.ai/?fpr=zinho-automates)**.
   The home page has a **Grab Your API Keys** link that goes straight there.
2. Create an API key. It comes in **two parts** — a key ID and a key secret. Copy both.
3. In the app, open **Settings** and paste them into the two fields. Save.

That's a one-time step. The key is stored in a local SQLite database on your own machine, and
the secret is never sent to the browser.

If you'd rather keep the key out of the database, copy `.env.example` to `.env.local` and put
it there instead. The app checks the database first and falls back to the environment file.

### Running it day to day

`npm start` serves the production build and is what you want normally. Use `npm run dev` only
if you're changing code — it recompiles on every edit and is slower to load.

The first `npm install` compiles a native SQLite module, so it takes a minute and needs a
working C++ toolchain. On macOS that means Xcode Command Line Tools
(`xcode-select --install`); most Linux distros need `build-essential`.

## The model registry

**`lib/catalog.ts` is generated, not hand-written.** Two commands rebuild it:

```bash
HF_API_KEY_ID=... HF_API_KEY_SECRET=... npm run discover
npm run build:registry
```

`discover` reads the live `GET /models` catalogue, then probes each model's `/estimate`
endpoint — which costs nothing — to learn:

- whether your key can reach it (`200` works · `404` not on your plan · `423` blocked ·
  `503` disabled by Higgsfield)
- its price, or that it's token-metered
- which fields are **required**, by submitting an empty body and following the errors
- each optional field's real enum values and type, by submitting deliberately invalid values
  and reading what the validator rejects

`build:registry` turns that into TypeScript, merging each model's text-to-X and image-to-X
endpoints into a single entry, so "Kling V3.0 Pro" is one model that swaps endpoint when you
attach an image rather than two near-identical rows.

Run both after Higgsfield adds models, or if your plan changes.

### Why it's generated

The published OpenAPI spec is wrong and incomplete. It misstates paths (`/veo3.1` is really
`/veo3.1/text-to-video`), enum values (Soul's resolution is `720p`/`1080p`, not `2K`/`4K`) and
types (it declares numeric enums as strings; the live API rejects `"8"` where it wants `8`).
It also omits most of the catalogue outright.

The critical part: **the API ignores unknown fields rather than rejecting them**, so a guessed
parameter name fails *silently* — you get a generation, just not the one you asked for. That's
why every parameter here comes from a live probe rather than documentation.

**13 models are hand-maintained** in `EXTRAS` inside `lib/models.ts`, because `GET /models`
doesn't list them even though they work — Soul Cinema, Popcorn, Soul Reference, Soul
Character, DoP, Veo and a few others. The catalogue is authoritative for what it contains, but
it is not exhaustive.

**Video and audio attachments are supported.** Models can declare `refKind: "video"` or
`"audio"`, and the composer accepts MP4 and WAV alongside images — by picker, drop or paste.
Attaching a clip to a model that wants a still (or vice versa) switches you to one that
matches. Higgsfield's storage only issues upload URLs for images, `video/mp4` and
`audio/wav`, so MOV, WebM and MP3 are rejected up front rather than failing mid-upload.

**Excluded:** six models (`motion-control`, `o3/video-edit`, `omni/video-edit`) return a
**500** from Higgsfield's own estimate endpoint, so they aren't usable by anyone right now.

Models needing **two keyframes** are supported: a model can declare `refKeys`, and successive
attachments fill each key in turn. Kling's First–Last Frame models use this.

## Typography

Every size in the app resolves through the scale at the top of `app/globals.css` — there are
no hardcoded pixel sizes left in any component. Adjusting the app's type means editing that
one block: 2xs 12 · xs 13 · sm 14 · base 16 · lg 20 · xl 24 · 2xl 30.

## Layout

Results are laid out as **justified rows**: items flow left-to-right and wrap, each row
scaled so it spans the full width with every aspect ratio intact and nothing cropped. The
newest result is top-left and the next one sits beside it.

This replaced column masonry, which reads top-to-bottom — in a newest-first library that put
the second-newest *underneath* the newest, which is confusing. No image measuring is needed,
because each tile's ratio comes from the parameters its job was submitted with, falling back
to the model's own default when a job didn't record one.

## Viewing results

Click any result to open it. **←** and **→** step through your library in the order it's laid
out, with a position counter and on-screen arrows; **Esc** closes. The arrows clamp at each
end rather than wrapping, so holding one doesn't silently loop back to the start.

Deleting from the viewer stays put and lets the next result slide into place, rather than
kicking you back to the grid.

## Deleting results

Every result has a delete control on hover, and a Delete button in the lightbox. Deletion is
per-result, not per-job: a batch of four images is one job with four outputs, so removing one
tile keeps the other three. The job row is cleaned up once its last output goes, and the file
is removed from `storage/media` at the same time.

Failed, blocked and cancelled jobs can be cleared in one action from the Library header.
Nothing of value is lost — Higgsfield doesn't charge for `failed` or `nsfw` requests, so they
never contributed to the spend history.

## Choosing a model

The picker is two levels: pick a family (Kling, Seedance, MiniMax…), then a variant. With ~54
models a flat list is unusable, and families match how people actually choose. Each row shows
its live price and a capability summary derived from what the API accepts.

Models your key can't reach are greyed out with the reason rather than failing at generation
time. Availability is detected live, so if Higgsfield enables or disables something the app
reflects it without a code change.

## Attachments

Click **+**, **drop a file anywhere on the page**, or **paste** one. Files stay in
local storage. The Seedance OpenRouter route encodes image/audio bytes only for
the outgoing model request; it does not publish a separate public copy.

Attaching an image on a model that can't use one switches you to a model that can, and says
so. Video models switch to their image-to-video endpoint automatically. A few models take
several images at once; most take exactly one.

## Metered models

Seedance and a few others bill per token rather than per generation, so there's no price to
quote up front. Those show `metered` instead of a figure, with an explanation, and Higgsfield
reconciles the exact charge afterwards. Metered jobs don't contribute to the dashboard's spend
totals or count against the spend cap, since there's no number to count.

## How it works

- **`lib/models.ts`** — types, helpers, and the hand-maintained `EXTRAS`. Composes with the
  generated `lib/catalog.ts` to form the registry the UI reads.
- **`lib/worker.ts`** — a server-side job engine. All Higgsfield generation is asynchronous,
  so jobs are submitted, polled (2s backing off to 10s, as the docs recommend) and downloaded
  here rather than in the browser. Generations survive closing the tab and, because state
  lives in SQLite, restarting the server.
- **`storage/`** — the database and a local copy of every generated file.

## Why files are downloaded

Higgsfield deletes generated output after about seven days. Every result is copied into
`storage/media/` and served from `/api/media/...`, so the library keeps working indefinitely.

Everything local lives in `storage/` — gitignored, and excluded from any archive of this
project, so it never travels with the code. Back it up if the generations matter; delete it to
start clean.

## Concurrency

Higgsfield applies back-pressure two different ways, and the worker treats both as "wait",
not "fail":

- **Concurrency** — a `400` whose text mentions "maximum number of concurrent requests"
  (4 on most accounts). Adjust the local limit in Settings.
- **Account queue** — a structured `{"code":"account_queue_full","retryable":true,
  "limit":10,"retry_after_seconds":30}`. This counts *all* queued generations on the
  account, including ones started from Higgsfield's own web app, so you can hit it even
  when this app is idle.

The worker keeps the job `pending` and waits out `retry_after_seconds` before trying again.
Genuine errors — a bad duration, a blocked model — still fail immediately rather than
looping.

## Cost

The Generate button shows a live USD estimate from Higgsfield's `/estimate` endpoint, which
prices a request without running it. Spend is tracked on the Home dashboard, and an optional
30-day spend cap in Settings blocks new generations once reached. Only completed jobs count —
Higgsfield doesn't charge for `failed` or `nsfw` requests.

Prices vary by plan, and some keys carry a percentage discount the API applies automatically.

## Branding and the referral link

`lib/brand.ts` holds the product name and the referral link on the home page.

The home-page banner links to `higgsfield.ai/?fpr=zinho-automates`, verified to resolve.

The palette lives at the top of `app/globals.css`. `--accent` (blue) is the action colour;
`--accent-2` (pink) is the secondary and marks video. Both are bright with near-black ink
rather than white — on a dark UI a colour dark enough to carry white text reads muted, whereas
a bright chip with dark text keeps its punch and still clears 7:1 contrast.

## Clip length

Where a model accepts a **contiguous** range of durations, the Length control is a slider
covering every second it allows — Kling 3.0 runs 3–15s, Seedance 2.5 goes to 16s, PixVerse
starts at 1s. Where the API only accepts specific values (Kling 2.5 Turbo is 5 or 10, LTX is
6/8/10), it stays a fixed choice, because a slider there would let you pick a duration the
API rejects.

`npm run discover` works this out by probing every value from 1 to 16 and checking whether
the accepted set is contiguous. An earlier version sampled only `[3,4,5,6,8,10,12]`, never
saw 7/9/11/13-16, and so capped several models far below their real limit.

## Video creation with an AI agent

Open a Codex session in this project and describe the desired video. `AGENTS.md`
routes it to [.agents/skills/video-agent/SKILL.md](.agents/skills/video-agent/SKILL.md).
The external agent handles interpretation, reference search and pixel review; the local
app validates files, voiceover timing and a genre-neutral generation package.

Run `npm run agent -- capabilities` for the local API contract. When the server
uses a different port, set runtime `VIDEO_AGENT_BASE_URL`, for example
`http://127.0.0.1:3001`; only loopback HTTP origins are accepted. The CLI supports
voice-library lookup through the sibling Voiceovers browser service, local uploads,
local reference binding, voiceover import, package preparation, review and
budgeted generation. See the skill's `references/contract.md` for commands and the
current boundaries. Preparing/loading a package starts no generation. Agent submission
deduplicates the same immutable package, including failed or removed Library jobs.

The Director API supports `scene` references for a complete opening composition
alongside finished dialogue. `firstFrameAssetId` is available for silent footage
only: OpenRouter frame images take priority over references, including audio,
so the app blocks that combination instead of silently losing cloned speech.
Scene guidance does not guarantee a frame-identical opening.

All project sources, recordings, results, exports, plans and evidence stay in the local `storage` directory. Do not publish them to Higgsfield or any cloud storage, and do not create tunnels, temporary hosting or public HTTPS media endpoints. Never request cloud-storage credentials as a workaround. Authorized provider API calls may send local bytes inline; HTTPS API communication is not media hosting. If inline media is unsupported, report the provider limitation and preserve local files instead of changing storage or audio mode.

Observed 2026-10-08: OpenRouter Seedance rejected inline audio with HTTP 400: `input_references[1].audio_url.url: Only HTTPS URLs are allowed`. No upstream video job was created. Do not repeat that incompatible route or claim transport acceptance from local tests.

Exception for the current meditation video: on 2026-10-08 the owner offered their existing Higgsfield storage key if necessary. Once supplied, Director input `referenceTransport: "higgsfield"` may upload only the selected image and finished dialogue copies for OpenRouter reference access. Keep original assets and outputs local. This is per order; do not change the project default or create tunnels, and do not request a BytePlus registration. Credentials alone do not select external storage for other orders.

`STUDIO_REFERENCE_TRANSPORT=local_inline` keeps sources in `storage/references`
and results in `storage/media`. Plans store local asset IDs and SHA256 bindings;
only an outgoing request expands them to data URLs. Local sources are preserved
even when a provider rejects this transport.
The private, Git-ignored `.env` holds the owner's authorized OpenRouter and
ElevenLabs keys. Blank Higgsfield fields are optional for its separate generation
route; do not paste an OpenRouter key into Higgsfield Key ID.

The real desktop-to-video 12s technical WAV handoff passed on2026-10-08. This proves
local transport and idempotency, not Seedance mouth alignment. External audio is an
experimental reference workflow; original soundtrack editing is a separate option.
The dated evidence is in [the audio/lip-sync research](docs/research/seedance-2.5-audio-lipsync-2026-10-08.json).
The [speech playbook](docs/research/seedance-2.5-speech-playbook.md) explains payloads,
language coverage, completed voiceover preparation, scene timing and acceptance checks.
It distinguishes audio guidance from unchanged soundtrack preservation, and includes
non-speaking soundscapes as well as speaking scenes.
BytePlus lists11native languages; the app does not claim every language or guaranteed
external-audio lip sync. Credentials and media remain outside Git.

## Keyboard

**Enter** sends the prompt. **Shift+Enter** inserts a line break. **⌘/Ctrl+Enter** also sends,
since that was the previous binding.

Enter is ignored while an IME candidate window is open (`isComposing`), so the composer stays
usable for anyone typing Japanese, Chinese or Korean — there, Enter is confirming a character
rather than submitting.
