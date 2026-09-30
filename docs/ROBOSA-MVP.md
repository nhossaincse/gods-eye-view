# Robosa MVP

Robosa is a separate Vite entry inside this repository. It now demonstrates a
multi-user, owner-controlled digital twin without changing the existing God's
Eye View application.

## Run it

```bash
npm run dev:robosa
```

Open `http://127.0.0.1:4173/studio`, create an owner account, then use the
published handle URL shown in the studio.

Server data is stored in `.robosa-data/database.json` for local development.
Set `ROBOSA_DATA_DIR` to use a different directory.

## Included

- Owner registration, sign-in, sign-out, and expiring HTTP-only sessions
- Scrypt password hashing and unique public handle claims
- Server-persisted profiles, conversations, and meeting requests
- Public twin routes such as `/nazmul`
- Optional OpenAI Responses chat via `OPENAI_API_KEY`
- Owner-approved deterministic answers when no model key is configured
- Pending, approved, and declined meeting request states
- Browser speech recognition and synthetic speech output
- Optional Open-LLM-VTuber WebSocket runtime for its configured agent and TTS
- Streaming audio playback acknowledgements, interruption, and audio-driven lip sync
- Interactive Three.js character with orbit, gaze, blink, and idle motion
- Oculus, VRM, and basic-jaw facial rig detection and playback
- Text-paced viseme animation for the local synthetic voice
- Reconstruction capture readiness and direct rigged GLB/VRM import
- Embedded MetaPerson portrait-to-3D generation and GLB export
- Private generated-model storage with profile-aware public delivery
- LAM Gaussian-avatar ZIP playback with 52-channel ARKit facial animation
- Visibility-aware LAM archive upload and public delivery
- Device-local photo and video source material in IndexedDB
- Desktop and mobile layouts

## Environment

- `OPENAI_API_KEY`: enables model-backed public twin replies
- `ROBOSA_OPENAI_MODEL`: overrides the default `gpt-5-nano` chat model
- `ROBOSA_DATA_DIR`: overrides the local database directory
- `ROBOSA_METAPERSON_CLIENT_ID`: enables MetaPerson Creator authentication
- `ROBOSA_METAPERSON_CLIENT_SECRET`: server-only MetaPerson credential
- `ROBOSA_METAPERSON_DOWNLOAD_HOSTS`: optional approved export CDN hostnames

## Current boundaries

The JSON store is a development persistence adapter, not a production database.
Source photos, videos, and manually imported GLB files stay on the owner's
current device. MetaPerson-generated GLBs and imported LAM ZIPs are copied into
the private Robosa data directory and served through the profile visibility
policy, so visitors on other devices can see the generated twin. Plain
portraits are static reconstruction inputs; Robosa no longer simulates lip sync
by scaling a crop of the source image. The
MetaPerson integration needs provider credentials and sends the selected
portrait to that provider after the owner starts generation. Expression video
is retained locally for a future high-fidelity worker and is not sent to
MetaPerson. The worker contract and generation choices are described in
`docs/ROBOSA-AVATAR-PIPELINE.md`. Browser speech does not expose phoneme
timestamps, so local visemes are paced from text and speech-boundary events
rather than provider timing. Streamed Open-LLM-VTuber audio is analyzed in the
browser when AudioWorklet is available. The optional
Open-LLM-VTuber mode connects to the configured `/client-ws` endpoint and uses
that runtime's character, knowledge, speech, and licensing configuration; it is
not bundled into Robosa. Its endpoint selection is device-local: a public
visitor cannot reach an owner's `127.0.0.1` runtime, so deployment requires a
hosted runtime or an authenticated server-side voice gateway. Email ownership
is not verified. There is no calendar OAuth, email delivery, custom voice, or
hosted media pipeline yet. Approving a request changes its status but does not
create a calendar event.

## Module map

- `src/robosa/main.js`: account, studio, public chat, and booking UI
- `src/robosa/profileStore.js`: local profile draft and validation contract
- `src/robosa/mediaStore.js`: device-local IndexedDB photo/video storage
- `src/robosa/avatarStore.js`: local 3D source and consent configuration
- `src/robosa/twin3d.js`: Three.js character, GLB loading, and facial rig driver
- `src/robosa/lamTwin.js`: LAM WebRender lifecycle and viseme-to-ARKit adapter
- `src/robosa/avatarRig.js`: Oculus, VRM, and jaw-fallback rig mapping
- `src/robosa/audioLipSync.js`: streamed audio viseme analysis adapter
- `src/robosa/metaPersonCreator.js`: secure embedded generation/export client
- `server/providers/robosa/metaperson.js`: provider token and GLB download policy
- `server/providers/robosa/avatarFiles.js`: private generated-model file store
- `src/robosa/twinBrain.js`: grounded fallback response routing
- `src/robosa/browserVoice.js`: browser recognition and speech synthesis
- `src/robosa/voiceRuntime.js`: Open-LLM-VTuber WebSocket and audio adapter
- `server/providers/robosa/api.js`: HTTP API and request policy
- `server/providers/robosa/service.js`: account, profile, booking, and conversation domain
- `server/providers/robosa/store.js`: atomic development persistence adapter
- `server/providers/robosa/chat.js`: server-owned model and grounded chat path
- `server/providers/robosa/routes.js`: studio and profile URL rewrites

## Next production milestone

1. Deploy LAM and LAM Audio2Expression on a licensed NVIDIA worker behind the avatar job contract.
2. Replace the JSON adapter with Postgres and encrypted object storage.
3. Add email verification, password recovery, and abuse controls.
4. Add reviewed document/media ingestion and permission-scoped retrieval.
5. Add calendar OAuth, free/busy filtering, and event creation after approval.
6. Add an authenticated hosted voice gateway for shared public twins.
