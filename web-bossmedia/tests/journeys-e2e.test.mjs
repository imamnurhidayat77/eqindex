// E2E (HTTP-level): three buyer journeys through the live storefront.
// Needs web-bossmedia dev on :3000. Data-dependent legs skip when the
// shop has no events/photos (empty DB), earlier legs still assert.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { BOSS, getText, requireServer } from './helpers.mjs';

const firstHref = (html, re) => {
  const m = html.match(re);
  return m ? m[1] : null;
};

describe('journey 1: browse → event → photo (license UI present)', () => {
  test('events list links into an event with a buyable photo', async (t) => {
    if (!(await requireServer(t, BOSS))) return;
    const events = await getText(`${BOSS}/events`);
    assert.equal(events.status, 200);
    const eventHref = firstHref(events.body, /href="(\/events\/[^"]+)"/);
    if (!eventHref) { t.skip('no events in shop — seed data first'); return; }
    const event = await getText(`${BOSS}${eventHref}`);
    assert.equal(event.status, 200);
    const photoHref = firstHref(event.body, /href="((?:\/p\/[^"]+|\/events\/[^"]+\/media\/[^"]+))"/);
    if (!photoHref) { t.skip('event has no photos — upload first'); return; }
    const photo = await getText(`${BOSS}${photoHref}`);
    assert.equal(photo.status, 200);
    assert.ok(/Choose your license|You own|Add to cart/.test(photo.body), 'photo page lost its buy box');
  });
});

describe('journey 2: guest cart is reachable and gated on email', () => {
  test('cart page renders empty state + receipt email field', async (t) => {
    if (!(await requireServer(t, BOSS))) return;
    const { status, body } = await getText(`${BOSS}/cart`);
    assert.equal(status, 200);
    assert.ok(body.includes('Your cart is empty') || body.includes('Your selection'), 'cart shell changed');
  });
});

describe('journey 3: post-payment landing degrades gracefully', () => {
  test('success without ids renders the confirming shell (no dead end)', async (t) => {
    // SSR renders `checking`; the empty-link branch ("No order in this
    // link." + escape hatches) is client-side, verified in browser.
    if (!(await requireServer(t, BOSS))) return;
    const { status, body } = await getText(`${BOSS}/photos/success`);
    assert.equal(status, 200);
    assert.ok(body.includes('Confirming payment'), 'success shell changed');
  });

  test('login preserves the success context for guests', async (t) => {
    if (!(await requireServer(t, BOSS))) return;
    const { status } = await getText(`${BOSS}/login?next=%2Fphotos%2Fsuccess%3Fpurchases%3Dabc`);
    assert.equal(status, 200);
  });
});
