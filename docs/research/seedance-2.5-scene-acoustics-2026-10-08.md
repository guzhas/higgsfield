# Seedance 2.5: speech that belongs in the filmed scene

Checked 2026-10-08. The actual OpenRouter submission used the complete-scene image
and finished cloned voice plus sea ambience in reference mode. It failed with
HTTP 400: `input_references[1].audio_url.url: Only HTTPS URLs are allowed`. No
upstream generation ID or video was created. Local sources and failed-attempt
evidence remain in `storage/agent-work/nubudimas-first-frame-20261008/`.

The owner rejected temporary HTTPS media access and confirmed local-only storage.
Do not create hosting/tunnels or ask for Higgsfield storage credentials. Direct
BytePlus base64 support does not prove that OpenRouter accepts inline audio.

[OpenRouter documentation](https://openrouter.ai/blog/insights/seedance-2-5-review/)
confirms that frame images take priority over all reference assets. The app now
blocks fixed-frame plus cloned-audio requests, and supports complete-scene image
guidance instead; that guidance does not pin an exact opening frame.

The prior meditation recordings were ElevenLabs TTS plus local sea mixing, not
Seedance output. Isolation and mixing checks do not prove outdoor acoustics. No
Seedance audio, Lithuanian speech or lip-sync result was generated or reviewed.

## Documented contracts

The [BytePlus 2.5 tutorial](https://docs.byteplus.com/es/docs/modelark/seedance-2-5)
directs authors to assign each numbered media reference a specific responsibility,
including voice timbre, and state what should not be copied. The
[official prompt guide](https://docs.byteplus.com/ko/docs/modelark/seedance-2-5-prompt-guide?redirect=1)
uses dialogue, environmental sound and explicit audio policies per shot. It
recommends reinforcing unwanted-music constraints and acknowledges audio and
speech failures. These are prompt practices, not measured acoustic guarantees.
Some opened BytePlus pages yielded JS shells; indexed official text provided
the relevant guidance.

[OpenRouter's request schema](https://openrouter.ai/docs/api/api-reference/video-generation/submit-a-video-generation-request)
accepts typed audio references and `generate_audio`. No dedicated microphone
distance, room impulse response, RT60, dereverberation or immutable soundtrack
field was found in that reviewed schema. The project must put acoustic intent
in its prompt, without inventing provider parameters. The reference guides
generation; it is not an unchanged audio passthrough.

[Shure's outdoor recording guidance](https://content-files.shure.com/Pubs/house-of-worship-audio-systems-guide-for-houses-of-worship/audio-systems-guide-for-houses-of-worship.pdf)
distinguishes open-air recording from wall/ceiling reflections. Its
[microphone-distance explanation](https://service.shure.com/articles/en_US/Knowledge/how-far-away-will-my-microphone-pick-up)
explains that distance and background level determine what reaches the microphone.
For an open sandy beach, requesting a generic room/hall reverb is the wrong
production direction. Terrain or nearby cliffs may still reflect sound; an
outdoor location does not mean every possible reflection is absent.

[ElevenLabs' TTS guide](https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech)
states that Similarity and Speaker Boost are unavailable on Eleven v3. Their
presence in an accepted JSON body does not establish a working v3 control.
[Audio Isolation](https://elevenlabs.io/docs/api-reference/audio-isolation/convert)
cleans an existing recording; it offers no microphone-distance/scene-acoustics
contract. Removing noise or applying EQ is not proof that a studio performance
now sounds like a phone recording outdoors.

## Production inference for this meditation advertisement

Separate three responsibilities:

| Responsibility | Intended input/output |
| --- | --- |
| Performance | Approved Lithuanian words, same permitted voice, cool restrained calm delivery, natural breathing and pauses |
| Acoustic perspective | Another person holds a stable phone, approximately 2 m away; natural conversational projection, open-air decay, no intimate studio narration or enclosed-room tail |
| Environment | The approved gentle sea, continuous through speech and pauses; no second sea layer or unrequested music |

The 2 m distance is an authored starting assumption for the user's phone-shot
brief, not a calibrated provider control. Do not create outdoor character by
adding a hall reverb plugin. Keep the speaker intelligible while making voice
and sea originate from one believable recording position.

Prefer a clean enrollment sample and a clean finished performance. If room
character persists in the clone, clean the exact original 0:24–0:56 sample and
create a separately named clone for comparison; preserve the old profile and
source. Then judge the newly synthesized voice without ambience. This is a
proposed next execution step, not something performed by this research.
Cleaning an already synthesized file repeatedly cannot be assumed to repair
the clone or its delivery.

With a speech-only reference, Seedance can be directed to generate dialogue
and one coherent sea environment from the same perspective. With an approved
mixed reference, assign the existing sea to the reference and forbid another
background layer. The latter can guide sea character/timing, but cannot promise
byte-identical preservation. Do not silently replace a visibly speaking video
with non-speaking footage to solve audio fidelity.

Lithuanian is absent from the tutorial's listed native speech languages.
Reference speech and exact Lithuanian lip sync remain unverified here; see the
[speech playbook](seedance-2.5-speech-playbook.md).

## Implemented in this project

- `SceneAcoustics` is a validated application-level profile shared by the guided
  creator, agent compiler and ad prompt builder. It describes space, microphone,
  distance, source acoustics and responsibility for ambience.
- `mixed` + `preserve_reference` and `speech_only` + scene generation are distinct.
  Contradictory combinations fail before paid preparation. Known `roomy` speech
  is rejected for open-air scenes. Unknown source quality is identified explicitly.
- Acoustic prompts preserve performance without demanding inherited source room
  response. The ad/native default no longer requests generic room tone outdoors.
- The profile survives transfer from an agent package into the ad editor.
  No unsupported acoustic fields are added to the provider JSON body.
- The guided UI exposes the choices using existing controls. Eleven v3 requests
  no longer send an ineffective similarity knob as an acoustic remedy.

## What still requires a real result

Listen to the whole isolated voice and whole final video. Compare the actual
words and pauses, check the voice/sea perspective and room tails, and inspect
visible articulation through the speech. Duration, peaks, a successful provider
response or an ASR transcript cannot certify these perceptual properties.
Record human/agent listening separately from structural validation.

Current local runtime has ElevenLabs connected, but OpenRouter and Higgsfield
storage credentials are absent. The implementation can be tested locally;
actual Seedance acoustic quality cannot be claimed until a real generation and
audible review complete.
