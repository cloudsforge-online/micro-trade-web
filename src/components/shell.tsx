/**
 * The app shell: the company bar, the section navigation, and the page.
 *
 * The bar is `CloudsForgeBar` from @cloudsforge/ui and is never reimplemented. It is passed
 * `PRODUCT` — 'trade' — so the switcher marks Forge Trade as current and leaves every other
 * product clickable.
 */
import { CloudsForgeBar, CloudsForgeFooter } from '@cloudsforge/ui'
import { NavLink, Outlet } from 'react-router-dom'
import { PRODUCT } from '../lib/hosts.ts'
import { NAV } from '../lib/routes.ts'
import { useSession } from '../lib/auth.tsx'

export function AppShell({ unregistered = false }: { unregistered?: boolean }) {
  const { account, signIn, signOut } = useSession()

  return (
    <>
      {/* Skip link first in the DOM: the backtest form is long, and a keyboard user should not
          have to tab the whole navigation to reach it. */}
      <a className="tw-skip" href="#main">
        Skip to the page
      </a>
      <CloudsForgeBar
        current={PRODUCT}
        account={account}
        onSignIn={() => signIn()}
        onSignOut={signOut}
      />
      {/*
        The sub-nav is sticky at exactly `var(--cf-bar-h)` — the bar's own height token, not a
        number copied out of it. When the bar's height changes, this moves with it.
      */}
      <nav className="wt-subnav" aria-label="Sections">
        <div className="wt-subnav__inner">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `wt-subnav__link${isActive ? ' is-active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
      <main className="wt-main" id="main">
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
        <Outlet />
      </main>

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
    </>
  )
}
