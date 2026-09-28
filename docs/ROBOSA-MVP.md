# Robosa MVP

Robosa is a separate Vite entry inside this repository. It demonstrates an
owner-controlled digital twin without changing the existing God's Eye View
application.

## Run it

```bash
npm run dev:robosa
```

Open `http://127.0.0.1:4173/studio` to edit the twin and
`http://127.0.0.1:4173/nazmul` to open its public profile.

## Included

- Identity, knowledge, appearance, and boundary controls
- Shareable local profile routes such as `/nazmul`
- Photo and video storage in browser IndexedDB
- Owner-approved, deterministic prototype answers
- Browser speech recognition when supported
- Browser speech synthesis with a deliberately synthetic voice treatment
- Local meeting requests with a clear no-send disclosure
- Desktop and mobile layouts

## Prototype boundaries

No profile, media, conversation, or booking leaves the browser. There is no
authentication, server database, identity verification, model-backed retrieval,
custom voice, avatar training, email delivery, or calendar connection yet. The
public page labels itself as an AI representative and does not display a
verification claim.

## Module map

- `src/robosa/main.js`: studio, public profile, chat, and booking UI
- `src/robosa/profileStore.js`: profile and booking persistence
- `src/robosa/mediaStore.js`: IndexedDB photo/video storage
- `src/robosa/twinBrain.js`: grounded prototype response routing
- `src/robosa/browserVoice.js`: browser recognition and speech synthesis
- `server/standalone/robosa-routes.js`: clean studio and profile URL rewrites

## Next production milestone

1. Add accounts, tenant ownership, and verified handle claiming.
2. Move profiles and encrypted media to server storage.
3. Add a reviewed ingestion pipeline and permission-scoped retrieval.
4. Replace the local response engine with a server-owned agent and audit log.
5. Issue short-lived Realtime credentials for low-latency voice sessions.
6. Add calendar OAuth, free/busy filtering, and approval-backed booking.
7. Add consent capture before custom voice or generated avatar features.
