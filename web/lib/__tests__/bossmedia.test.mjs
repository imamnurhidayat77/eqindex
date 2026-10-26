import test from 'node:test';
import assert from 'node:assert/strict';
import { BOSSMEDIA_URL, bossPhotoUrl, bossPhotosUrl, bossEventUrl } from '../bossmedia.js';

test('bossPhotoUrl: points at the Boss Media photo page', () => {
  assert.equal(bossPhotoUrl('abc-123'), `${BOSSMEDIA_URL}/p/abc-123`);
});

test('bossPhotosUrl: keeps only set filters, drops empties', () => {
  const u = bossPhotosUrl({ kind: 'reel', horse: '', rider: null, q: 'Apollo' });
  assert.ok(u.startsWith(`${BOSSMEDIA_URL}/photos?`));
  assert.ok(u.includes('kind=reel') && u.includes('q=Apollo'));
  assert.ok(!u.includes('horse=') && !u.includes('rider='));
});

test('bossPhotosUrl: bare shop URL with no filters', () => {
  assert.equal(bossPhotosUrl(), `${BOSSMEDIA_URL}/photos`);
  assert.equal(bossPhotosUrl({}), `${BOSSMEDIA_URL}/photos`);
});

test('bossEventUrl: encodes the event slug', () => {
  assert.equal(bossEventUrl('spring-fling'), `${BOSSMEDIA_URL}/events/spring-fling`);
});
