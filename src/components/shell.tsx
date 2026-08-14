/**
 * The app shell: the company bar, the section navigation, and the page.
 *
 * The bar is `CloudsForgeBar` from @cloudsforge/ui and is never reimplemented. It is passed
 * `PRODUCT` — 'trade' — so the switcher marks Forge Trade as current and leaves every other
 * product clickable.
 *
 * Three more pieces of the shared chrome arrived with @cloudsforge/ui 1.1 and are composed here
 * rather than reimplemented: `SkipLink` first in the document, `MainRegion` around the page, and
 * `CookieBanner` last. See the note beside each.
 */
import { useEffect, useState } from 'react'
import {
  CloudsForgeBar,
  CloudsForgeFooter,
  CookieBanner,
  MainRegion,
  SkipLink,
  SubNav,
  miningOnHub,
} from '@cloudsforge/ui'
import { applyHead, surfaceMeta } from '@cloudsforge/ui/seo'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { PRODUCT, hosts } from '../lib/hosts.ts'
import { NAV, ROUTES } from '../lib/routes.ts'
import { useSession } from '../lib/auth.tsx'
import { setViewedNetwork, viewedNetwork, type ViewedNetwork } from '../lib/viewed.ts'

export function AppShell({ unregistered = false }: { unregistered?: boolean }) {
  // The viewed network: in-tab memory, defaulting to the hostname's own (micro-org#459).
  // `setViewedNetwork` runs first in the handler below so the remounted tree reads the new value
  // on its very first render.
  const [viewed, setViewed] = useState<ViewedNetwork>(viewedNetwork())
  const { account, signIn, signOut } = useSession()

  return (
    <>
      {/*
        The skip link is the first focusable thing in the document, and it is now the SHARED one.
        The backtest form is long and the bot pages are longer, so a keyboard reader should not have
        to tab the bar, the switcher, the account menu and the section navigation on every
        navigation to reach the page — WCAG 2.2 SC 2.4.1 is about exactly the repeated block the
        shared bar is. `MainRegion` below is the half that is easy to get wrong: this app's own
        `<main id="main">` had no `tabIndex={-1}`, so the fragment scrolled the page and left focus
        on the link, and the next Tab went back into the bar. The shared component sets it.
      */}
      <SkipLink />
      {/*
        BROWSER MINING, BESIDE THE ACCOUNT, ON EVERY ADDRESS THIS APP SERVES.

        The owner's report was that starting a miner is "hidden deep in mining page, it should be
        easy found near the account on all pages". The bar is the only chrome every address of every
        surface renders, so it is the only place the offer can be made ONCE and be everywhere; and
        the design system renders it immediately left of the account menu, so its position does not
        drift from surface to surface the way a `rightSlot` would. Thirteen screens here, not one.

        `miningOnHub()`, which is the `elsewhere` state, because this is not the hub. A session is a
        WebSocket to the pool plus two Web Workers grinding scrypt, pinned to one origin, and
        `hub.<apex>` is not this origin — nothing in this bundle can start, observe or stop one over
        there. So the control renders an ANCHOR to the surface that can, which is middle-clickable,
        openable in a new tab and legible to everything that reads links. Pretending otherwise would
        need a cross-origin channel that does not exist, to fake a session that is not here.

        It promises no payment, and does not have to be told to: `payoutsImplemented` defaults to
        false, so the description carries `NOT_PAID_CLAUSE`. That default is the honest one for this
        surface in particular — a bundle whose every other figure is a balance, a fill price or a
        mark is the worst possible place to put a number beside the word Mine.

        `hosts().hub`, never a written-out URL. This bundle is served from localhost, from a preview
        host and from `trade.<apex>`, and a literal would be right on exactly one of them — the same
        argument the whole of lib/hosts.ts makes, and the rule `.github/workflows/ci.yml` enforces.
      */}
      {/*
        In-app network context (micro-org#459, the combined view). The reader's choice lives in
        `lib/viewed.ts` — module memory, never storage — and the `key` on the Outlet below is the
        refetch mechanism: switching remounts the page tree, and `apiBase()` reads `viewedHosts()`,
        so the same page re-reads itself from the other estate WITHOUT going anywhere. The band and
        the switcher both follow the selection, so testnet data under a mainnet address bar is
        never unmarked. The bar also stamps `?net=` onto its product links, which is what carries
        the choice across a product switch — every surface is its own origin, so nothing else can.
      */}
      <CloudsForgeBar
        current={PRODUCT}
        account={account}
        onSignIn={() => signIn()}
        onSignOut={signOut}
        mining={miningOnHub(hosts().hub)}
        networkSwitch={{
          selected: viewed,
          onSelect: (n) => {
            setViewedNetwork(n)
            setViewed(n)
          },
        }}
      />
      {/*
        THE STRIP OF SECTIONS, AND IT IS THE SHARED ONE NOW.

        This app wrote its own — `.wt-subnav`, `.wt-subnav__inner`, `.wt-subnav__link`, sticky at
        `var(--cf-bar-h)` with an `__inner` bounded at `var(--cf-max-w)` — and it was one of ELEVEN
        copies of the same strip in the estate, under eight class prefixes, all plainly from one
        original. It was one of the better copies: it had `overflow-x: auto` and
        `white-space: nowrap`, so it scrolled on a phone instead of breaking its labels mid-word
        the way four of the eleven did, and its measure already agreed with the bar's. That is the
        sharp half of the finding rather than a reason to keep it — the fix existed here, was
        correct, and could not reach the other ten, because there was nothing for it to travel
        through. `SubNav` is that thing.

        WHAT MOVING IT CHANGES, on this surface specifically:

          * the current section is marked in THREE channels rather than two. `.wt-subnav__link
            .is-active` used ink and a 2px underline; `.cf-subnav__link--current` adds
            `font-weight: 600`. The underline is drawn in `--cf-accent`, which is a per-product hue
            — trade's is `#2a9e93` — so a reader who separates no hues was being told which section
            they were on by one signal that had gone grey and one that never varied. Weight
            survives both.
          * the spacing scale steps back up. The links were padded `--cf-space-md --cf-space-sm`
            against the shared `--cf-space-lg --cf-space-md`, so this row sat tighter than the same
            row on every surface a reader reaches it from — which is exactly the seam the shared
            bar directly above exists to remove.
          * the links get a focus ring. There was no `:focus-visible` rule here at all and no
            global one in this stylesheet, so a keyboard reader tabbing the sections fell back to
            the user agent's; `.cf-subnav__link:focus-visible` draws it in `--cf-accent` at
            `outline-offset: -2px`, which is what keeps it from being clipped by the scroll box.

        The label stays this app's own wording, and the links stay here: `SubNav` takes the wording
        as a prop and the markup as children precisely so that sharing a strip does not mean
        renaming anybody's sections or teaching a design system about react-router.
      */}
      <SubNav label="Sections">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `cf-subnav__link${isActive ? ' cf-subnav__link--current' : ''}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </SubNav>
      <DocumentMeta />
      <MainRegion className="wt-main">
        {/*
          Not fatal, so not a refusal — this app has a public catalogue worth serving and nothing
          here is a security boundary. But not silent either. `cloudsforgeHosts()` derives the apex
          by stripping a KNOWN subdomain, so an address the registry does not know makes every
          estate URL resolve one level too deep: trade, and the account portal with it. The symptom
          is a site that cannot sign anybody in and says nothing about why.
        */}
        {unregistered && (
          <p className="tw-note tw-note--warn" role="status">
            <span className="tw-note__icon" aria-hidden="true">
              ▲
            </span>
            This page is being served from an address the CloudsForge surface registry does not
            know, so every host it resolves — including the account portal and this product’s own
            API — is derived from the wrong apex. Its home is the{' '}
            <code className="cf-num">trade</code> surface.
          </p>
        )}
        <Outlet key={viewed} />
      </MainRegion>

      {/*
        The company footer, from @cloudsforge/ui. Not written here, and deliberately not
        `<footer>` markup of this app's own: the estate had four hand-rolled footers and nine
        surfaces with none, and the registry's `developers` row has been claiming all along that
        the developer console is "reached from the footer" — a navigation path that existed
        nowhere. Every link in it is derived from SURFACES, so a new product appears here without
        this file changing.

        `account` is passed for one reason: it decides whether the operator surfaces are offered.
        Omitting it would hide them, which is safe, but this app already knows and a signed-in
        operator should be able to reach Admin from any page.
      */}
      <CloudsForgeFooter current={PRODUCT} account={account} />

      {/*
        LAST in the document, and therefore last in the tab order. That is deliberate: the banner is
        a dialog and is explicitly NOT modal, so a reader who came here to read the strategy
        catalogue can read it and answer afterwards. A consent banner that traps focus is the
        coercion the regulation is about. It renders nothing at all until it knows the reader has
        not already answered, and nothing on an origin where analytics would not report anyway.

        Reject and Accept are one class with no modifier — see `.cf-consent__choice` in ui.css.
        Nothing in this repository's stylesheet may make one of them louder than the other.
      */}
      <CookieBanner />
    </>
  )
}

/**
 * Keep `document.title`, the description, the Open Graph tags and the canonical link in step with
 * the address.
 *
 * A component in the shell rather than a hook each page calls, because the failure mode of the
 * second shape is the page that forgets — and the page that forgets is the one added last, which
 * is the one nobody has bookmarked and therefore the one nobody notices is titled with the
 * previous page's title.
 *
 * The tags themselves are `surfaceMeta` from `@cloudsforge/ui/seo`, which derives the surface name,
 * the description and the robots directive from the registry row this app already identifies itself
 * by. Nothing is retyped here, so a change to the `trade` row moves the tab, the search result and
 * the social card together. The static tags in `index.html` stay exactly as they are: they are what
 * a link-preview fetcher that runs no JavaScript gets, and this is what a browser and an executing
 * crawler get.
 */
function DocumentMeta() {
  const { pathname } = useLocation()
  useEffect(() => {
    applyHead(surfaceMeta(PRODUCT, { ...pageMeta(pathname), path: pathname }), window.location.origin)
  }, [pathname])
  return null
}

/**
 * This page's own title, and whether a crawler is invited to it.
 *
 * `robots` is read off `ROUTES` rather than decided here, because that table already says which
 * addresses render without a session. Every route but the catalogue is a `ProtectedRoute`, so an
 * indexed one could only ever be the sign-in redirect — a search result advertising an address
 * nobody but its owner can open. The catalogue is the page this product wants read, and it keeps
 * the registry's `index, follow`.
 *
 * The market terminal is titled with the SYMBOL rather than the word "Market", because a trader
 * keeps several open and the tab strip is the only thing that tells them apart. It is uppercased
 * from the address rather than read from the loaded market: this runs on navigation, before the
 * market read has returned, and a tab that says "Market" for two seconds and then changes is worse
 * than one that says what was asked for. An address that names no real market is 404ing in the
 * page anyway.
 */
function pageMeta(pathname: string): { title?: string; robots?: string } {
  const segments = pathname.split('/').filter((s) => s !== '')
  const head = segments[0]
  const tail = segments[1]

  // The index. `surfaceMeta` titles it with the surface name alone rather than "Forge Trade —
  // Forge Trade", which is what a naive suffix produces on a front door.
  if (head === undefined) return {}

  const route = ROUTES.find((r) => r.path === head)
  const gated = route !== undefined && !route.public ? { robots: 'noindex, nofollow' } : {}

  if (head === 'markets') {
    if (tail === undefined) return { title: 'Markets', ...gated }
    return { title: tail.toUpperCase(), ...gated }
  }
  if (head === 'orders') {
    if (tail === undefined) return { title: 'Your orders', ...gated }
    return { title: 'Order', ...gated }
  }
  if (head === 'balances') return { title: 'Balances', ...gated }
  if (head === 'backtests') {
    if (tail === undefined) return { title: 'Backtests', ...gated }
    return { title: tail === 'new' ? 'Queue a backtest' : 'Backtest', ...gated }
  }
  if (head === 'bots') {
    if (tail === undefined) return { title: 'Bots', ...gated }
    return { title: tail === 'new' ? 'Create a bot' : 'Bot', ...gated }
  }
  // An address this app does not own. nginx has already answered 404; the title says so too, and
  // the directive keeps a mistyped link out of an index.
  return { title: 'Not found', robots: 'noindex, nofollow' }
}
