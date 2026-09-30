# Robosa LAM Worker

This directory contains the thin authenticated API used by Robosa to run the
upstream LAM Gradio inference service on a dedicated NVIDIA worker.

## RunPod layout

- LAM checkout: `/workspace/src/LAM`
- Python environment: `/workspace/lam-env`
- Persistent models and caches: `/workspace/cache`
- Worker data and token: `/workspace/lam-worker`
- Service logs: `/workspace/logs`

`convertFBX2GLB.py` supports Blender 4.4. `lam-app.patch` fixes the upstream
relative archive path after its working-directory change.

Expose HTTP port `8888` and use this RunPod start command:

```bash
/workspace/lam-worker/app/start-services.sh
```

The public `/health` route is unauthenticated. All `/v1/avatar-jobs` routes
require `Authorization: Bearer <token>`, where the token is stored mode `0600`
at `/workspace/lam-worker/token`. Uploaded portraits and LAM tracking files are
removed after each job; Robosa deletes the worker artifact after importing it
into its private avatar store.

The released LAM model weights are CC BY-NC 4.0. This deployment is suitable
for evaluation; commercial use requires permission or compatible weights.
