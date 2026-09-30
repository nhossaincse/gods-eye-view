# Robosa Avatar Pipeline

Robosa treats avatar generation and avatar playback as separate systems. The
browser captures approved source media and renders a LAM reconstructed head, a
static source portrait, or a finished 3D avatar. MetaPerson Creator is the
implemented first GLB generator; LAM ZIP playback is implemented for exports
created by a separate self-hosted GPU worker.

## Published modes

- **LAM portrait:** stores a LAM export ZIP privately, renders its Gaussian
  splats with the official WebRender package, and drives all 52 ARKit channels
  from Robosa's viseme stream. Natural blinks are generated between speech
  frames.
- **Interactive 3D:** renders a generated or imported GLB/VRM in Three.js and
  maps the same viseme stream to Oculus morphs, VRM expressions, or jaw motion.
- **Static photo:** publishes the approved JPEG, PNG, or WebP without claiming
  facial animation. Source photos are never deformed or pasted onto a model.

The selected mode is part of the server-backed public profile, so the same
appearance is shown to visitors on other devices.

## Product flow

1. Capture one neutral front portrait and an 8-15 second expression video.
2. Record consent and create a private reconstruction job.
3. Generate the person's head/body geometry and textures on a GPU worker or
   through an avatar provider.
4. Rig the result with a humanoid skeleton, eye blinks, and speech expressions.
5. Validate the model, then publish the optimized GLB/VRM or LAM ZIP.
6. Delete or archive raw captures according to the owner's retention choice.

The expression video should include a slow head turn, two blinks, a smile, and
the vowel sequence `A E I O U`. It is reconstruction input, not the animation
shown during a conversation.

## Model contract

The GLB/VRM playback-ready file must meet this minimum contract:

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

A LAM ZIP must keep the export's top-level avatar directory and include
`skin.glb`, `animation.glb`, `offset.ply`, and `vertex_order.json`. Robosa caps
uploads at 120 MB, stores them outside the public tree, and exposes them only
through the profile visibility policy. The browser dynamically loads
`gaussian-splat-renderer-for-lam` only when this mode is active.

## Worker API

The studio uses `ROBOSA_LAM_WORKER_URL` plus either
`ROBOSA_LAM_WORKER_TOKEN` or `ROBOSA_LAM_WORKER_TOKEN_FILE`. These values are
read by the Robosa server only. The browser submits its selected portrait to
the same-origin Robosa endpoint, then polls job progress while the server
handles worker authentication and private artifact import.

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

The open-source reconstruction track now has browser playback, but generation
still belongs on a separate Linux/NVIDIA worker:

- [LAM](https://github.com/aigc3d/LAM) reconstructs an animatable Gaussian head
  from one portrait. Robosa now imports its ZIP and uses the separate
  [LAM WebRender](https://github.com/aigc3d/LAM_WebRender) package for playback.
  [LAM Audio2Expression](https://github.com/aigc3d/LAM_Audio2Expression) can
  replace Robosa's current viseme-to-ARKit mapping with neural, audio-derived
  coefficients on the GPU worker. The repository code is Apache-2.0 and
  WebRender is MIT, but the released model weights are
  [CC BY-NC 4.0](https://github.com/aigc3d/LAM/blob/master/LICENSE_WEIGHT).
  Those pretrained weights are suitable for noncommercial evaluation only.
  A commercial Robosa deployment needs written permission or independently
  trained, commercially compatible weights.

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

Robosa has four lip-sync paths, in descending order of quality:

1. LAM Audio2Expression frames containing the 52 ARKit coefficients. This is
   the production target; the GPU service is not bundled yet.
2. Exact viseme timestamps returned by the TTS service.
3. Browser audio analysis for streamed Open-LLM-VTuber audio using HeadAudio.
4. Text and speech-boundary estimation for browser `speechSynthesis`.

The player maps those signals to LAM ARKit morphs, Oculus morph targets, VRM
mouth expressions, or a basic jaw fallback. A static photo intentionally
ignores speech animation. Each animated player returns the face to silence
after interruption or playback completion.

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
