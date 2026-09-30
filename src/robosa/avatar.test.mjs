import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAvatarConfig, saveAvatarConfig } from './avatarStore.js';
import { visemeForCharacter } from './browserVoice.js';
import { mediaKind } from './mediaStore.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('legacy portrait rigs migrate to the demo character', () => {
  const storage = memoryStorage();
  saveAvatarConfig(
    {
      mode: 'photo-rig',
      portraitMediaId: 'portrait-1',
      profileHandle: 'Nazmul',
      consentAt: '2026-09-28T10:00:00.000Z',
    },
    storage,
  );
  const saved = loadAvatarConfig(storage);
  assert.equal(saved.mode, 'procedural');
  assert.equal(saved.portraitMediaId, 'portrait-1');
  assert.equal(saved.profileHandle, 'nazmul');
});

test('capture readiness is preserved without claiming a generated model', () => {
  const storage = memoryStorage();
  const saved = saveAvatarConfig(
    {
      mode: 'procedural',
      captureStatus: 'ready',
      capturePreparedAt: '2026-09-28T10:00:00.000Z',
    },
    storage,
  );
  assert.equal(saved.captureStatus, 'ready');
  assert.equal(saved.mode, 'procedural');
});

test('hosted generated avatars remain selected across reloads', () => {
  const storage = memoryStorage();
  saveAvatarConfig(
    {
      mode: 'hosted',
      profileHandle: 'nazmul',
      builtAt: '2026-09-29T10:00:00.000Z',
    },
    storage,
  );
  assert.equal(loadAvatarConfig(storage).mode, 'hosted');
});

test('GLB media is recognized even when the browser omits its MIME type', () => {
  assert.equal(mediaKind({ name: 'twin.glb', type: '' }), 'model');
  assert.equal(mediaKind({ name: 'twin.vrm', type: '' }), 'model');
  assert.equal(
    mediaKind({ name: 'twin.bin', type: 'model/gltf-binary' }),
    'model',
  );
});

test('speech characters map to stable mouth shapes', () => {
  assert.equal(visemeForCharacter('m'), 'PP');
  assert.equal(visemeForCharacter('f'), 'FF');
  assert.equal(visemeForCharacter('o'), 'O');
  assert.equal(visemeForCharacter('a'), 'aa');
  assert.equal(visemeForCharacter('t'), 'DD');
});
