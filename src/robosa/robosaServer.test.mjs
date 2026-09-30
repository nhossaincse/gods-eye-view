import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRobosaStore } from '../../server/providers/robosa/store.js';
import { createRobosaApiHandler } from '../../server/providers/robosa/api.js';
import {
  createRobosaService,
  RobosaServiceError,
} from '../../server/providers/robosa/service.js';
import { answerRobosaChat } from '../../server/providers/robosa/chat.js';
import { DEFAULT_PROFILE } from './profileStore.js';

async function testService() {
  const directory = await mkdtemp(path.join(tmpdir(), 'robosa-test-'));
  const store = createRobosaStore({ directory });
  return { store, service: createRobosaService(store) };
}

function mockResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    end(body = '') {
      this.body = body;
    },
  };
}

test('owner registration persists a claimed public profile and session', async () => {
  const { store, service } = await testService();
  const registration = await service.register({
    email: 'Owner@Example.com',
    password: 'correct horse battery staple',
    handle: 'owner-test',
    profile: { ...DEFAULT_PROFILE, handle: 'owner-test' },
  });

  assert.equal(registration.user.email, 'owner@example.com');
  assert.equal(registration.profile.handle, 'owner-test');
  assert.equal(registration.profile.ownerId, undefined);

  const sessionHash = createHash('sha256')
    .update(registration.token)
    .digest('hex');
  const session = await service.sessionByHash(sessionHash);
  assert.equal(session.user.id, registration.user.id);

  const reloaded = createRobosaService(
    createRobosaStore({ directory: path.dirname(store.filePath) }),
  );
  assert.equal(
    (await reloaded.publicProfile('owner-test')).displayName,
    'Nazmul',
  );
});

test('handles are unique and passwords are checked without exposing hashes', async () => {
  const { service } = await testService();
  await service.register({
    email: 'one@example.com',
    password: 'a secure password',
    handle: 'claimed-handle',
    profile: DEFAULT_PROFILE,
  });

  await assert.rejects(
    service.register({
      email: 'two@example.com',
      password: 'another secure password',
      handle: 'claimed-handle',
      profile: DEFAULT_PROFILE,
    }),
    (error) =>
      error instanceof RobosaServiceError && error.code === 'HANDLE_TAKEN',
  );
  await assert.rejects(
    service.login({ email: 'one@example.com', password: 'wrong password' }),
    (error) => error.code === 'INVALID_CREDENTIALS',
  );
});

test('meeting requests remain pending until their owner reviews them', async () => {
  const { service } = await testService();
  const owner = await service.register({
    email: 'calendar@example.com',
    password: 'calendar password',
    handle: 'calendar-owner',
    profile: DEFAULT_PROFILE,
  });
  const request = await service.createBooking('calendar-owner', {
    guestName: 'Visitor',
    guestEmail: 'visitor@example.com',
    slot: 'Tuesday, 10:00 AM',
  });

  assert.equal(request.status, 'pending');
  const approved = await service.updateBooking(
    owner.user.id,
    request.id,
    'approved',
  );
  assert.equal(approved.status, 'approved');
  assert.equal(
    (await service.listBookings(owner.user.id))[0].status,
    'approved',
  );
});

test('chat uses grounded local answers when no provider key is configured', async () => {
  const answer = await answerRobosaChat({
    profile: DEFAULT_PROFILE,
    message: 'Tell me about Robosa.me',
    apiKey: '',
  });
  assert.equal(answer.mode, 'grounded');
  assert.match(answer.text, /owner-controlled digital twin/i);
});

test('private twins are visible and conversational only to their owner', async () => {
  const { service } = await testService();
  const owner = await service.register({
    email: 'private@example.com',
    password: 'private twin password',
    handle: 'private-owner',
    profile: { ...DEFAULT_PROFILE, visibility: 'private' },
  });

  assert.equal(await service.publicProfile('private-owner'), null);
  assert.equal(
    (await service.publicProfile('private-owner', owner.user.id)).handle,
    'private-owner',
  );
  await assert.rejects(
    service.conversation('private-owner', ''),
    (error) => error.code === 'PROFILE_NOT_FOUND',
  );
  assert.ok(
    (await service.conversation('private-owner', '', owner.user.id)).id,
  );
});

test('generated avatar metadata follows profile visibility', async () => {
  const { service } = await testService();
  const owner = await service.register({
    email: 'avatar@example.com',
    password: 'avatar owner password',
    handle: 'avatar-owner',
    profile: DEFAULT_PROFILE,
  });
  const profile = await service.completeAvatar(owner.user.id, {
    size: 2048,
    sha256: 'a'.repeat(64),
    avatarCode: 'provider-private-code',
  });

  assert.equal(profile.avatarModel.rigProfile, 'oculus-15');
  assert.match(profile.avatarModel.url, /avatar-owner\/avatar\.glb/);
  assert.equal(
    (await service.avatarAccess('avatar-owner')).ownerId,
    owner.user.id,
  );

  await service.updateProfile(owner.user.id, {
    ...profile,
    visibility: 'private',
  });
  assert.equal(await service.avatarAccess('avatar-owner'), null);
  assert.equal(
    (await service.avatarAccess('avatar-owner', owner.user.id)).ownerId,
    owner.user.id,
  );
});

test('generated GLBs are delivered through the public profile model route', async () => {
  const { store, service } = await testService();
  const owner = await service.register({
    email: 'model-route@example.com',
    password: 'model route password',
    handle: 'model-route',
    profile: DEFAULT_PROFILE,
  });
  const model = Buffer.from('glTF-generated-model');
  await service.completeAvatar(owner.user.id, {
    size: model.length,
    sha256: 'b'.repeat(64),
  });
  const handler = createRobosaApiHandler({
    store,
    avatarFiles: { read: async () => model },
  });
  const response = mockResponse();
  await handler(
    {
      method: 'GET',
      url: '/profiles/model-route/avatar.glb',
      headers: { host: 'localhost' },
      socket: {},
    },
    response,
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['content-type'], 'model/gltf-binary');
  assert.deepEqual(response.body, model);
});
