/**
 * Reading `/auth/me`.
 *
 * Identity answers `{ user: {...}, session: {...}, organisations: [...] }`. The route is
 * `identity/src/server.ts:891-903` and the body is built by `toPublicUser` at
 * `identity/src/users.ts:52-63`; both were opened and read for this repository.
 *
 * The estate got this wrong once at the root — the web template read `handle` and `roles` off the
 * TOP level, four frontends inherited it, and every signed-in operator saw a switcher with the
 * admin entries missing because `roles` was always null. It is fixed upstream
 * (`micro-web-template/src/lib/auth.tsx:26`, and lines 98-99 read `me?.user?.…`).
 *
 * This bundle follows the TEMPLATE rather than micro-mint-web on one point: only the nested shape
 * is accepted. mint-web keeps a flat fallback for a rollback path; the template's own comment
 * argues the other way — "tolerating the flat one as a fallback would encode a response identity
 * does not send, and the next reader would not be able to tell which is real" — and there is no
 * proxy in this estate that flattens the body. The absence of the fallback is asserted below so
 * that the choice stays a decision.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { readCustomer } from '../src/lib/auth.tsx'

/** A real `/auth/me` body, field for field as `toPublicUser` builds it. */
const REAL = {
  user: {
    id: '5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
    email: 'trader@example.test',
    emailVerifiedAt: '2026-01-01T00:00:00.000Z',
    handle: 'trader',
    status: 'active',
    roles: ['admin', 'support'],
    createdAt: '2026-01-01T00:00:00.000Z',
    lastSeenAt: null,
  },
  session: { id: 'sess-1', amr: ['pwd'] },
  organisations: [],
}

describe('the nested shape identity actually sends', () => {
  it('reads the handle and the roles from under `user`', () => {
    const customer = readCustomer(REAL)
    assert.equal(customer.handle, 'trader')
    assert.deepEqual(customer.roles, ['admin', 'support'])
  })

  it('does NOT read a flat body, because identity does not send one', () => {
    // The assertion that makes this file differ from micro-mint-web's on purpose. A flat body is
    // not a shape this estate produces; accepting it would encode a fiction.
    const customer = readCustomer({ handle: 'flat', roles: ['admin'] })
    assert.equal(customer.handle, null)
    assert.deepEqual(customer.roles, [])
  })

  it('survives a body that is not an object at all', () => {
    for (const body of [null, undefined, 'nope', 42, []]) {
      const customer = readCustomer(body)
      assert.equal(customer.handle, null)
      assert.deepEqual(customer.roles, [])
    }
  })

  it('survives a null user, which is what a partially-migrated response would carry', () => {
    const customer = readCustomer({ user: null })
    assert.equal(customer.handle, null)
    assert.deepEqual(customer.roles, [])
  })

  it('treats an empty handle as absent rather than as an empty name', () => {
    assert.equal(readCustomer({ user: { handle: '' } }).handle, null)
  })

  it('drops a non-string out of roles rather than passing it to the bar', () => {
    // The company bar tests `roles.includes('admin')`. A number in that array is harmless; an
    // object is not, because something downstream will render it.
    const customer = readCustomer({ user: { roles: ['admin', 7, null, { x: 1 }] } })
    assert.deepEqual(customer.roles, ['admin'])
  })

  it('returns roles as an array even when the field is missing entirely', () => {
    // Never null. `isAdmin` in the shared bar reads `roles?.includes`, and the four-frontend defect
    // was that this was null in every one of them.
    assert.deepEqual(readCustomer({ user: { handle: 'x' } }).roles, [])
  })
})

describe('the source says what it does', () => {
  const source = readFileSync(new URL('../src/lib/auth.tsx', import.meta.url), 'utf8')

  it('reads the nested path and nothing else', () => {
    assert.match(source, /\(body as MeResponse\)\.user/)
  })

  it('declares no top-level handle or roles on the response type', () => {
    // If somebody re-adds the flat fallback, this fails and points them at the comment explaining
    // why it was left out.
    const decl = source.slice(source.indexOf('export interface MeResponse'), source.indexOf('export interface Customer'))
    assert.doesNotMatch(decl, /^\s{2}handle\?:/m, 'a flat handle is back on MeResponse')
    assert.doesNotMatch(decl, /^\s{2}roles\?:/m, 'a flat roles is back on MeResponse')
  })

  it('cites the two lines the shape was read from', () => {
    assert.match(source, /identity\/src\/server\.ts:891-903/)
    assert.match(source, /identity\/src\/users\.ts:52-63/)
  })
})
