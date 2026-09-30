# Robosa Avatar Pipeline

Robosa treats avatar generation and avatar playback as two separate systems.
The browser captures approved source media and renders a finished avatar.
MetaPerson Creator is the implemented first generator; the asynchronous worker
contract below remains the replacement point for a future video-based pipeline.

## Product flow

1. Capture one neutral front portrait and an 8-15 second expression video.
2. Record consent and create a private reconstruction job.
3. Generate the person's head/body geometry and textures on a GPU worker or
   through an avatar provider.
4. Rig the result with a humanoid skeleton, eye blinks, and speech expressions.
5. Validate the model, then publish only the optimized GLB or VRM.
6. Delete or archive raw captures according to the owner's retention choice.

The expression video should include a slow head turn, two blinks, a smile, and
the vowel sequence `A E I O U`. It is reconstruction input, not the animation
shown during a conversation.

## Model contract

The playback-ready file must meet this minimum contract:

- Binary GLB or VRM, with embedded or same-origin assets
- One humanoid skeleton and a stable forward-facing rest pose
- Oculus-style visemes (`viseme_PP` through `viseme_U`) or VRM mouth
  expressions (`aa`, `ih`, `ou`, `ee`, and `oh`)
- Left and right blink expressions
- Textures sized for web delivery and a target file size below 30 MB
- Explicit rig metadata in the reconstruction job result

Robosa inspects every imported file. It reports full Oculus lip sync, five-shape
VRM lip sync, basic jaw motion, or no usable facial speech rig. A model without
speech shapes still renders, but the studio disables the lip-sync test.

## Worker API

The first production adapter can use this asynchronous contract:

```http
POST /v1/avatar-jobs
Content-Type: multipart/form-data

portrait=<image>
expressionVideo=<video>
consentReceipt=<signed JSON>
output=glb
rig=oculus
```

```json
{
  "id": "avjob_123",
  "status": "queued"
}
```

```http
GET /v1/avatar-jobs/avjob_123
```

```json
{
  "status": "complete",
  "progress": 100,
  "modelUrl": "https://media.robosa.me/twins/avjob_123.glb",
  "sha256": "...",
  "rigProfile": "oculus-15",
  "blink": true
}
```

The application server should mint short-lived upload URLs and download URLs.
The public profile should never expose raw portraits or capture videos.

## Generation choices

The MVP embeds MetaPerson Creator, authenticates it with a server-minted
short-lived token, requests a GLB containing `mobile_51` and `visemes_15`, then
copies the exported model into Robosa's private avatar store. The full
server-side MetaPerson REST pipeline requires its Enterprise plan. This does not
use a Meta or Facebook API.

An open-source reconstruction track is possible, but it is a larger R&D project:

- MICA reconstructs a FLAME face mesh from an image. It produces geometry and
  FLAME parameters, so Robosa would still need hair/body creation, texturing,
  facial retargeting, GLB export, and the separately licensed FLAME model.
- FATE builds a full-head Gaussian avatar from monocular video. It needs a CUDA
  research worker and a custom Gaussian renderer; its output is not a drop-in
  skinned GLB for the current Three.js player.
- Open-LLM-VTuber supplies conversation orchestration and Live2D animation. It
  does not reconstruct a person's 3D face from uploaded portraits.

Keep provider-specific code behind the worker contract so Robosa can begin with
a hosted generator and later replace it with an in-house pipeline.

## Lip sync

Robosa has three lip-sync paths, in descending order of quality:

1. Exact viseme timestamps returned by the TTS service.
2. Browser audio analysis for streamed Open-LLM-VTuber audio using HeadAudio.
3. Text and speech-boundary estimation for browser `speechSynthesis`.

The player maps those signals to Oculus morph targets, VRM mouth expressions,
or a basic jaw fallback. It smooths transitions in the render loop and returns
the face to silence after interruption or playback completion.

For production voice, make the TTS gateway return audio plus timed visemes. Keep
HeadAudio as the fallback for arbitrary audio streams and previews.

## Security gates

- Require verified ownership and explicit subject consent before job creation.
- Encrypt capture media and generated models at rest.
- Reject files with unsupported types, dimensions, duration, or size before GPU
  work starts.
- Run model conversion in an isolated worker and scan output before publishing.
- Watermark public twins as AI representatives and provide report/takedown flows.
- Store consent, generator version, source hashes, and model hashes in an audit
  record without publishing those records.
