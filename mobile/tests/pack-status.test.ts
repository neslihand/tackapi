import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatBytes, packStatus, sizeBucket } from '../src/lib/packStatus';

const pack = { slugs: ['a', 'b'], version: 'v1' };

test('no pack', () => assert.equal(packStatus(null, ['a'], 'v1', 0), 'none'));

test('a pack of the current version is ready', () => assert.equal(packStatus(pack, ['a', 'b'], 'v1', 0), 'ready'));

test('offline, the version cannot be known and the pack keeps working', () => assert.equal(packStatus(pack, ['a', 'b'], null, 0), 'ready'));

test('a new version on the server asks for an update, the old pack stays', () => assert.equal(packStatus(pack, ['a', 'b'], 'v2', 0), 'new_version'));

test('a stop added to the route', () => assert.equal(packStatus(pack, ['a', 'b', 'c'], 'v2', 0), 'stops_changed'));

test('a stop removed from the route still leaves a usable pack', () => assert.equal(packStatus(pack, ['a'], null, 0), 'ready'));

test('missing pieces come before everything else', () => assert.equal(packStatus(pack, ['a', 'b', 'c'], 'v2', 3), 'damaged'));

test('a pack saved before versions existed is offered the update', () => assert.equal(packStatus({ slugs: ['a'] }, ['a'], 'v1', 0), 'new_version'));

test('sizes', () => {
  assert.equal(formatBytes(500), '1 KB');
  assert.equal(formatBytes(50 * 1024), '50 KB');
  assert.equal(formatBytes(2.5 * 1024 * 1024), '2.5 MB');
  assert.equal(formatBytes(48.4 * 1024 * 1024), '48 MB');
});

test('size buckets carry no exact size', () => {
  assert.equal(sizeBucket(1), 'under_10mb');
  assert.equal(sizeBucket(49 * 1024 * 1024), '10_50mb');
  assert.equal(sizeBucket(199 * 1024 * 1024), '50_200mb');
  assert.equal(sizeBucket(201 * 1024 * 1024), 'over_200mb');
});
