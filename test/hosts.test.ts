/**
 * Where this bundle talks to, and how it decides.
 *
 * The rule the whole file exists to keep: NOTHING here is a build-time constant. Every host is
 * derived from `window.location` on the call, so one image serves localhost, a preview deployment
 * and production — and the tests install four different windows to prove it rather than trusting
 * a comment.
 *
 * The second thing under test is the dev-port disagreement, asserted as a FACT rather than fixed
 * with a literal: the registry gives `trade` 4006 and the trade service binds 4000
 * (`trade/src/env.ts:166`, `trade/.env.example:44`). See the header of src/lib/hosts.ts.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, describe, it } from 'node:test'
import { SURFACES, cloudsforgeHosts, type CloudsForgeHosts } from '@cloudsforge/ui'
import {
  APP_NAME,
  PRODUCT,
  apiBase,
  isLocal,
  isRegisteredPlacement,
  resolveApiBase,
} from '../src/lib/hosts.ts'
import { installWindow, removeWindow } from './browser-stubs.ts'

afterEach(removeWindow)

/**
 * A file in this repository, as text.
 *
 * vite.config.ts and app.tsx are READ rather than imported: the first pulls in a Vite plugin and
 * the second the whole React tree, and this suite deliberately has no DOM.
 */
const read = (file: string): string =>
  readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

/** The production host table, as `cloudsforgeHosts()` derives it from an apex hostname. */
function production(): CloudsForgeHosts {
  installWindow('https://trade.cloudsforge.online/')
  const hosts = cloudsforgeHosts()
  removeWindow()
  return hosts
}

describe('the surface this app is', () => {
  it('is the trade surface, which is what the switcher marks current', () => {
    assert.equal(PRODUCT, 'trade')
  })

  it('is registered as a product, in the switcher, with its own subdomain', () => {
    const surface = SURFACES.find((s) => s.key === PRODUCT)
    assert.ok(surface, 'trade is not in the surface registry')
    assert.equal(surface.kind, 'product')
    assert.equal(surface.inSwitcher, true)
    assert.equal(surface.subdomain, 'trade')
    assert.equal(surface.name, 'Forge Trade')
  })

  it('reports a name to the observability ingest that names the bundle, not the product', () => {
    // Lantern groups on it, and "trade" is the surface while "trade-web" is the artefact that
    // threw. An error report that cannot name the bundle cannot be pinned to a deploy.
    assert.equal(APP_NAME, 'trade-web')
  })
})

describe('the API base is an origin comparison, never a flag', () => {
  const hosts = production()

  it('is relative when the page and the API share an origin', () => {
    // Production: nginx serves this bundle and trade serves /v1 behind trade.<apex>.
    assert.equal(resolveApiBase('https://trade.cloudsforge.online', hosts, PRODUCT), '')
  })

  it('is absolute when they do not', () => {
    assert.equal(resolveApiBase('https://hub.cloudsforge.online', hosts, PRODUCT), hosts[PRODUCT])
  })

  it('is absolute when there is no page origin at all', () => {
    assert.equal(resolveApiBase('', hosts, PRODUCT), hosts[PRODUCT])
  })

  it('resolves from the window on every call, so one image serves every environment', () => {
    installWindow('https://trade.cloudsforge.online/bots')
    assert.equal(apiBase(), '')
    removeWindow()

    installWindow('http://localhost:5186/bots')
    // Under `pnpm dev` the page is on Vite's port and the service is on the registry's, so the
    // request goes cross-origin and absolute.
    assert.notEqual(apiBase(), '')
    assert.match(apiBase(), /^http:\/\/localhost:\d+$/)
  })
})

describe('the dev port disagreement, recorded rather than papered over', () => {
  /**
   * A hard-coded host would be a second, unversioned copy of the registry, and the copy is the one
   * that goes stale — so this app resolves 4006 and the README tells a developer to start trade on
   * it. The test pins BOTH halves so the day either moves, this fails and names the other.
   */
  it('the registry gives trade devPort 4006', () => {
    assert.equal(SURFACES.find((s) => s.key === 'trade')?.devPort, 4006)
  })

  it('and this app therefore calls 4006 on localhost, which is what the README explains', () => {
    installWindow('http://localhost:5186/')
    assert.equal(apiBase(), 'http://localhost:4006')
  })

  it('the vite dev port is not the registry port, and must not be confused with it', () => {
    // The registry's devPort names where the API answers; Vite's names where the bundle is served.
    // admin-web had to draw this distinction after its own entry was read as the latter.
    const vite = /server:\s*\{\s*port:\s*(\d+)/.exec(read('vite.config.ts'))
    assert.ok(vite, 'vite.config.ts declares no dev server port')
    assert.notEqual(Number(vite[1]), 4006)
  })

  it('the README says how to start the service on the port this app calls', () => {
    // The disagreement is only survivable because one line of the README makes it true. If that
    // line goes, the finding goes back to being undiagnosable.
    assert.match(read('README.md'), /PORT=4006/, 'the README no longer says how to reconcile it')
  })
})

describe('local development is exempt, in exactly the four names cloudsforgeHosts() exempts', () => {
  it('treats the four as local', () => {
    for (const hostname of ['', 'localhost', '127.0.0.1', 'dev.local']) {
      assert.equal(isLocal(hostname), true, hostname)
    }
  })

  it('treats a real hostname as not local', () => {
    for (const hostname of ['trade.cloudsforge.online', 'example.test', 'localhost.evil.test']) {
      assert.equal(isLocal(hostname), false, hostname)
    }
  })
})

describe('the placement warning', () => {
  const hosts = production()

  it('accepts this surface’s own origin', () => {
    assert.equal(
      isRegisteredPlacement('https://trade.cloudsforge.online', 'trade.cloudsforge.online', hosts),
      true,
    )
  })

  it('accepts localhost, where there is no apex to get wrong', () => {
    assert.equal(isRegisteredPlacement('http://localhost:5186', 'localhost', hosts), true)
  })

  it('flags an address the registry does not know', () => {
    // An unknown prefix is left alone, so the whole name becomes the apex and every derived host —
    // trade, the account portal — resolves one level too deep.
    assert.equal(
      isRegisteredPlacement('https://preview-7.example.test', 'preview-7.example.test', hosts),
      false,
    )
  })

  it('flags another surface’s origin', () => {
    assert.equal(
      isRegisteredPlacement('https://hub.cloudsforge.online', 'hub.cloudsforge.online', hosts),
      false,
    )
  })

  it('warns rather than refusing, because this surface has a public catalogue worth serving', () => {
    // The opposite of admin-web, which refuses to render at all. Asserted so the difference stays
    // a decision: a product page that blanks itself on a preview deployment is worse than one that
    // says where it is.
    const app = read('src/app.tsx')
    assert.doesNotMatch(app, /MisplacedBundle/, 'this surface must not refuse to render')
    assert.match(app, /unregistered/, 'the placement must still be passed to the shell')
  })
})
