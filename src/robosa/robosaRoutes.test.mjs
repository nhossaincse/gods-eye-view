import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRobosaPath } from '../../server/standalone/robosa-routes.js';

test('Robosa routes reserve the existing app and asset paths', () => {
  assert.equal(resolveRobosaPath('/'), null);
  assert.equal(resolveRobosaPath('/api'), null);
  assert.equal(resolveRobosaPath('/src'), null);
  assert.equal(resolveRobosaPath('/logo.svg'), null);
});

test('Robosa routes support studio and public handles', () => {
  assert.equal(resolveRobosaPath('/studio'), 'studio');
  assert.equal(resolveRobosaPath('/robosa/'), 'studio');
  assert.equal(resolveRobosaPath('/nazmul'), 'profile');
  assert.equal(resolveRobosaPath('/nazmul-hossain'), 'profile');
});
