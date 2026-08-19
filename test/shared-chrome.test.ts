/**
 * THE SHARED CHROME RENDERS HERE, AND ITS HOOKS ACTUALLY RUN.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY A TEST WHOSE SUBJECT IS ANOTHER REPOSITORY'S COMPONENT
 *
 * It is not asserting what `@cloudsforge/ui` draws — micro-ui owns that. It is asserting a fact
 * about THIS repository's test process: that `@cloudsforge/ui` and this app end up sharing ONE
 * React. They do not by default. `link:../ui/packages/ui` symlinks the design system's working
 * tree, that tree has its own `react` (a devDependency it genuinely needs to test itself), and
 * Node resolves a bare specifier from the importing file's REALPATH — so the design system's
 * components reach the second copy, share no dispatcher with ours, and the first hook they call
 * throws `Cannot read properties of null (reading 'useState')`.
 *
 * `--import @cloudsforge/ui/test-loader` in the `test` script is what collapses the two. This file
 * is what notices when it stops. Delete the flag and these tests are the first to go red.
 *
 * Publishing `dist` did NOT make that unnecessary, though eight repositories predicted it would:
 * `dist/index.js` has the same realpath as `ui/packages/ui/src/index.tsx`, so it finds the same second copy. What
 * publishing `dist` did fix was the OTHER workaround — the classic JSX transform, and the
 * `globalThis.React` that used to sit in `test/dom.ts`.
 *
 * ── Why it clicks rather than only mounting ───────────────────────────────────────────────────
 *
 * A mount that does not throw is weak evidence: `CloudsForgeLogo` renders perfectly well with two
 * Reacts in the process, because it calls no hook — that was measured. The dropdowns are the ones
 * that break, so each is OPENED, which requires `useState` to hold a value across a re-render and
 * `useId` to have produced the id `aria-controls` names. A second dispatcher cannot fake that.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, test } from 'node:test'
import {
  AccountMenu,
  CloudsForgeBar,
  HUB_MINE_PATH,
  NOT_PAID_CLAUSE,
  ProductSwitcher,
} from '@cloudsforge/ui'
import { createElement as h } from 'react'
import { App } from '../src/app.tsx'
import { PRODUCT, hosts } from '../src/lib/hosts.ts'
import { NAV } from '../src/lib/routes.ts'
import * as fx from './fixtures.ts'
import { withScreen, type Routes, type Screen } from './dom.ts'

/**
 * `allowEmpty` because the subject is a strip of chrome, not a page: the bar's own text is well
 * under the 40 characters `assertMounted` requires of a mounted app. Every test below then asserts
 * on named elements instead, which is a stricter check than the length heuristic it waives.
 */
const CHROME = { allowEmpty: true } as const

/** The dropdown triggers, which is how they are found without hard-coding this surface's label. */
const triggers = (s: Screen): Element[] => [...s.document.querySelectorAll('[aria-haspopup="menu"]')]

test('the company bar renders, signed out', async () => {
  await withScreen(h(CloudsForgeBar, { current: PRODUCT, account: { signedIn: false } }), CHROME, async (s) => {
    assert.ok(s.document.querySelector('[role="banner"]'), 'CloudsForgeBar rendered no banner')
    s.byRole('link', 'CloudsForge home')
    s.byRole('button', 'Sign in')
    assert.equal(triggers(s).length, 1, 'signed out, the switcher is the only dropdown')
    s.clean('the bar, signed out')
  })
})

test('the product switcher opens, which means its useState held', async () => {
  await withScreen(h(CloudsForgeBar, { current: PRODUCT, account: { signedIn: false } }), CHROME, async (s) => {
    const trigger = triggers(s)[0] as Element
    assert.equal(trigger.getAttribute('aria-expanded'), 'false')
    assert.equal(s.document.querySelector('[role="menu"]'), null, 'the menu is closed to begin with')

    await s.click(trigger)

    assert.equal(trigger.getAttribute('aria-expanded'), 'true', 'the click did not reach state')
    const menu = s.document.querySelector('[role="menu"][aria-label="CloudsForge products"]')
    assert.ok(menu, 'the switcher opened no menu')
    assert.ok(
      menu.querySelectorAll('[role="menuitem"]').length > 1,
      'an open switcher with fewer than two products is not a switcher',
    )
    // `aria-controls` names the menu by an id from `useId`, which is the other hook in play.
    assert.equal(menu.getAttribute('id'), trigger.getAttribute('aria-controls'))
    s.clean('opening the product switcher')
  })
})

test('the account menu opens for a signed-in viewer, and offers sign out', async () => {
  const account = { signedIn: true, handle: 'ada' }
  await withScreen(h(CloudsForgeBar, { current: PRODUCT, account }), CHROME, async (s) => {
    const trigger = triggers(s)[1] as Element
    assert.match(s.textOf(trigger), /ada/, 'the second dropdown is not the account menu')

    await s.click(trigger)

    const menu = s.document.querySelector('[role="menu"][aria-label="Account"]')
    assert.ok(menu, 'the account menu opened nothing')
    assert.match(s.textOf(menu), /Sign out/)
    s.clean('opening the account menu')
  })
})

test('ProductSwitcher and AccountMenu also render standing alone', async () => {
  // Named directly, not only through the bar: these are the two components measured to throw
  // without deduplication, and a test that reached them only via a parent would stop covering
  // them the day the bar stopped composing them.
  await withScreen(h(ProductSwitcher, { current: PRODUCT }), CHROME, async (s) => {
    assert.equal(triggers(s).length, 1)
    s.clean('ProductSwitcher alone')
  })
  await withScreen(h(AccountMenu, { account: { signedIn: false } }), CHROME, async (s) => {
    s.byRole('button', 'Sign in')
    s.clean('AccountMenu alone')
  })
})

/* ── browser mining, from the bar ───────────────────────────────────────────────────────────── */

/**
 * THE OFFER OF BROWSER MINING IS BESIDE THE ACCOUNT, ON EVERY ADDRESS, AND PROMISES NOTHING.
 *
 * The owner's report was that starting a miner is "hidden deep in mining page, it should be easy
 * found near the account on all pages". These mount the WHOLE APP rather than the bar, because the
 * defect they exist to catch is not in `@cloudsforge/ui` — micro-ui's `mining.test.ts` owns what
 * the control draws. It is in THIS file's shell: `mining` is an opt-in prop, a bar rendered without
 * it is a perfectly valid bar, and a shell that stops passing it is indistinguishable from one that
 * never did by typecheck, by lint and by every test above. Only mounting the app and reading the
 * bar closes that.
 *
 * Reverting the one line in `src/components/shell.tsx` turns every assertion below red and leaves
 * the rest of the suite green, which is the mutation proof for this change.
 *
 * ── Why the `elsewhere` state is the right answer here and not a degraded one ──────────────────
 *
 * A session is a WebSocket to the pool plus two Web Workers, pinned to one origin. `hub.<apex>` is
 * not this origin, so nothing in this bundle can start, observe or stop one over there; pressing
 * the control is asserted in micro-hub-web, which actually mounts the miner. What this surface owes
 * the reader is that the offer EXISTS, that it says where it works, and that it takes them there by
 * a link they can middle-click — the same argument `accountSettingsUrl` makes, and for the same
 * reason: an `onClick` standing in for a destination is invisible to every check that reads links,
 * which is how a wrong one survived on nineteen surfaces.
 */
describe('the mining control in the bar', () => {
  /**
   * Three addresses of three different kinds, because "on all pages" is the report and one page is
   * not evidence of it: the public catalogue that anyone can read, a gated address that renders a
   * sign-in invitation instead of a page, and an address this app does not own at all — which nginx
   * answers 404 for while still serving this shell (`BJ-TRADE-404`). The chrome is the same on all
   * three or the chrome is not chrome.
   */
  const ADDRESSES: ReadonlyArray<{ path: string; what: string; routes: Routes }> = [
    { path: '/', what: 'the public strategy catalogue', routes: { 'GET /v1/strategies': { body: { strategies: [fx.strategy()] } } } },
    { path: '/bots', what: 'a gated address, signed out', routes: {} },
    { path: '/nothing-here', what: 'an address this app does not own', routes: {} },
  ]

  const atAddress = async (path: string, routes: Routes, body: (s: Screen) => Promise<void>) =>
    // `${path}` is a ROUTER path — `/`, `/bots`, `/nothing-here` — and the page it names is under
    // the mount since wave 3b. Composing without it puts the browser on micro-site's root, where
    // this app's router matches nothing and every bar assertion below fails for the wrong reason.
    withScreen(h(App), { url: `https://cloudsforge.online/trade${path}`, routes, allowEmpty: true }, async (s) => {
      await s.settle(20)
      await body(s)
    })

  for (const { path, what, routes } of ADDRESSES) {
    it(`is in the bar on ${path} — ${what}`, async () => {
      await atAddress(path, routes, async (s) => {
        const bar = s.document.querySelector('.cf-bar')
        assert.ok(bar, 'this app no longer renders the company bar')
        const found = [...bar.querySelectorAll('.cf-mine')]
        assert.equal(found.length, 1, `expected one mining control in the bar, found ${found.length}`)

        const mine = found[0] as Element
        /*
         * An anchor, and pointed at HUB. Getting the surface wrong is the likely mistake rather
         * than a hypothetical one: this file already imports `hosts()` for its own API base, and
         * `hosts().trade` is the neighbouring property — a control that offered mining and led back
         * to the page the reader is already on would be indistinguishable from a working one in
         * every screenshot.
         */
        assert.equal(mine.tagName, 'A', 'the mining control is not a link')
        assert.equal(
          mine.getAttribute('href'),
          `${hosts().hub}${HUB_MINE_PATH}`,
          'the mining control does not point at Forge Hub’s mining address',
        )
      })
    })
  }

  it('is the tab stop immediately before the account, not merely near it in the layout', async () => {
    const { path, routes } = ADDRESSES[0] as (typeof ADDRESSES)[number]
    await atAddress(path, routes, async (s) => {
      /*
       * DOCUMENT ORDER, NOT CSS. A stylesheet can put a box anywhere on the row — `order:` and
       * `flex-direction: row-reverse` both do it without moving a single node — so a check that
       * read the rendered geometry would pass for a control that a keyboard reader reaches last,
       * after the switcher and the whole page. The tab order is what the reader who never sees the
       * layout actually gets, and "near the account" is a claim about where you find it, not about
       * where it is painted.
       */
      const order = s.tabbables()
      const mine = s.document.querySelector('.cf-mine') as Element
      const account = s.byRole('button', 'Sign in')
      assert.ok(order.includes(mine), 'the mining control is not reachable by keyboard at all')
      assert.equal(
        order.indexOf(account) - order.indexOf(mine),
        1,
        'the mining control is no longer immediately before the account in the tab order',
      )
    })
  })

  it('promises no payment, and carries no figure that could be read as one', async () => {
    const { path, routes } = ADDRESSES[0] as (typeof ADDRESSES)[number]
    await atAddress(path, routes, async (s) => {
      const mine = s.document.querySelector('.cf-mine') as Element

      /*
       * `pool/src/payouts.ts` states it: "PAYOUTS ARE OFF." `payoutsImplemented` is derived by the
       * service and is false on this estate, and `miningOnHub()` defaults to false rather than
       * asking this bundle — which has never spoken to the pool — to assert otherwise.
       *
       * Asserted against the exported constant rather than a paraphrase of it, so that rewording
       * the sentence in micro-ui does not quietly turn this into a test of a string that no longer
       * appears anywhere.
       */
      const described = s.document.getElementById(mine.getAttribute('aria-describedby') ?? '')
      assert.ok(described, 'the mining control carries no description for a screen reader')
      assert.ok(
        s.textOf(described).includes(NOT_PAID_CLAUSE),
        'the mining control does not carry the not-paid clause',
      )

      /*
       * And no number, which bites harder on this surface than on any other in the estate. Every
       * other figure in this bundle is money or a quantity of an asset — a balance, a fill price, a
       * mark, an equity curve — so a digit rendered beside the word Mine lands in a row of real
       * ones and reads as a third. `pool-web/src/components/notices.tsx` states the standard: not
       * zeroed and not greyed out, because a zero reads as "not yet, but soon" and the truth is
       * "not at all".
       */
      assert.doesNotMatch(
        `${s.textOf(mine)} ${s.textOf(described)}`,
        /[$€£]|\d/,
        'the mining control shows a figure, and nothing is paid',
      )
      // The vocabulary too, not only the digits: "earn", "reward", "payout" are the words a reader
      // would take as a promise even with no number attached.
      assert.doesNotMatch(
        `${s.textOf(mine)} ${s.textOf(described)}`,
        /earn|revenue|reward|payout|profit/i,
        'the mining control uses the vocabulary of being paid',
      )
    })
  })
})

/* ── the strip of sections ──────────────────────────────────────────────────────────────────── */

/**
 * THE ROW OF SECTIONS UNDER THE BAR IS THE SHARED ONE, READ OFF THE RENDERED DOCUMENT.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THE DOM ASSERTION IS THE LOAD-BEARING ONE AND THE STYLESHEET ASSERTION IS NOT
 *
 * A source-text check can prove `.wt-subnav*` is gone from `src/styles.css`. That is true of a
 * shell which still renders `<nav className="wt-subnav">` — and THAT state is strictly worse than
 * the one before this change: a strip with no rules at all, rather than a duplicated one. It is
 * also invisible to `tokens.test.ts` (which reads names, not selectors), to `base-layer.test.ts`
 * (which reads the `body` rule), to `tsc`, and to every screenshot taken on a machine with a warm
 * cache. Only mounting the app and reading the class off the landmark closes it.
 *
 * So both are asserted, in that order of importance: reverting `src/components/shell.tsx` alone
 * turns the first three red and leaves the stylesheet one green.
 *
 * ── The trap this file walked past ────────────────────────────────────────────────────────────
 *
 * Grepped before writing these, and recorded because the absence is the finding: this repository
 * had NO test that selected `.wt-subnav__link`, `.wt-subnav` or `.is-active`. Eleven siblings
 * shared this strip and at least one had a test walking the old class, which matches nothing once
 * the prefix becomes `cf-` — a suite that goes green by asserting over an empty NodeList. There was
 * nothing here to break, and the checks below are the ones that make the next such rename loud
 * rather than silent: `assert.equal(links.length, NAV.length)` cannot pass on nothing.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the strip of sections, as it is actually rendered', () => {
  const CATALOGUE: Routes = { 'GET /v1/strategies': { body: { strategies: [fx.strategy()] } } }

  const atIndex = async (body: (s: Screen) => Promise<void>) =>
    withScreen(h(App), { url: 'https://cloudsforge.online/trade/', routes: CATALOGUE }, async (s) => {
      await s.settle(20)
      await body(s)
    })

  it('is the SHARED landmark, labelled in this surface’s own words', async () => {
    await atIndex(async (s) => {
      const strips = s.document.querySelectorAll('nav.cf-subnav')
      assert.equal(strips.length, 1, 'expected exactly one shared sub-nav landmark')
      const strip = strips[0] as Element
      // The wording is this app's, not the design system's. `SubNav` takes it as a prop precisely
      // so that sharing a strip does not mean renaming anybody's sections.
      assert.equal(strip.getAttribute('aria-label'), 'Sections')
      assert.ok(strip.querySelector('.cf-subnav__inner'), 'the scrolling inner box is missing')
      // And the private copy is gone from the DOCUMENT, not merely from the stylesheet.
      assert.equal(
        s.document.querySelectorAll('.wt-subnav, [class*="wt-subnav__"]').length,
        0,
        'the private strip is still being rendered',
      )
    })
  })

  it('carries every section from the route table, on the shared link class', async () => {
    await atIndex(async (s) => {
      const links = [...s.document.querySelectorAll('nav.cf-subnav a')]
      // Against NAV rather than against a number, so adding a seventh section does not pass by
      // being uncounted — and so this can never be satisfied by an empty strip.
      assert.equal(links.length, NAV.length, 'the strip and the route table disagree')
      assert.deepEqual(
        links.map((l) => s.textOf(l)),
        NAV.map((n) => n.label),
      )
      for (const link of links) {
        const cls = link.getAttribute('class') ?? ''
        assert.ok(
          cls.split(/\s+/).includes('cf-subnav__link'),
          `a section link reads class="${cls}"`,
        )
        assert.ok(!cls.includes('wt-subnav'), `a section link still carries a local class: "${cls}"`)
      }
    })
  })

  it('marks the section being read with the shared modifier, not `is-active`', async () => {
    await atIndex(async (s) => {
      const current = [...s.document.querySelectorAll('.cf-subnav__link--current')]
      assert.equal(current.length, 1, 'exactly one section is the one being read')
      assert.equal(s.textOf(current[0]), 'Strategies', 'the index is not marking Strategies')
      /*
       * `is-active` was the local spelling and the design system does not declare it. Scoped to the
       * strip rather than to the document: a section link asking for a class nobody declares renders
       * as an ordinary link — no ink, no underline, no weight — and reports nothing at all. That is
       * the silent half of this rename, and it is the half a typecheck cannot see.
       */
      assert.equal(s.document.querySelectorAll('nav.cf-subnav .is-active').length, 0)
    })
  })

  it('leaves no private copy of the strip in this stylesheet', () => {
    /*
     * Comments stripped first — the same treatment `tokens.test.ts` and `base-layer.test.ts` give
     * this file, and for the same reason: the tombstone left where these rules were NAMES them, in
     * order to record what moved and what the surface gained. A scan of the raw text would match
     * the explanation and fail a correct stylesheet, which is a check that can only be satisfied by
     * deleting its own reason.
     */
    const css = readFileSync(fileURLToPath(new URL('../src/styles.css', import.meta.url)), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    assert.doesNotMatch(css, /\.wt-subnav/, 'the private sub-nav rules are still declared here')
    // Nor layered back over the shared one, one declaration at a time, which is a copy again.
    assert.doesNotMatch(css, /\.cf-subnav/, 'this stylesheet overrides the shared sub-nav')
  })
})
