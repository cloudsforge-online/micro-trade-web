/**
 * Session state for the tree, and the gate in front of the routes that need one.
 *
 * Hiding a route is NOT the security boundary. `trade` verifies the bearer on every route that
 * needs one (`authenticate`, `trade/src/server.ts:779-785`), and every owned resource is filtered
 * by `user_id` in the query itself — `getOwnedBot` (`trade/src/bots.ts:217-223`) and
 * `getOwnedBacktest` — so another customer's bot is a **404**, the same answer as "no such bot",
 * so ids cannot be enumerated. This exists so that a signed-out customer is sent to sign in
 * instead of being shown a screen made entirely of 401s.
 *
 * **One route is deliberately outside the gate**, because the service put it outside: `GET
 * /v1/strategies` (`trade/src/server.ts:342`) makes no `authenticate()` call at all. See
 * `src/lib/routes.ts`.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * ── The `/auth/me` shape, re-read for this repository ─────────────────────────────────────────
 *
 * Identity answers `{ user: {...}, session: {...}, organisations: [...] }` — the profile is
 * **NESTED under `user`**. The route is `identity/src/server.ts:891-903` and the body is built by
 * `toPublicUser` at `identity/src/users.ts:52-63`. Both citations were opened and read against the
 * source for this repository rather than carried over from a sibling.
 *
 * That shape is worth stating because the estate got it wrong once, at the root: the web template
 * declared `interface Me { handle?, roles? }` and read both fields off the TOP level, where they
 * are not. Four frontends inherited it, `roles` was then always null, `isAdmin` in the shared
 * company bar was always false, and the switcher hid every `adminOnly` entry from every signed-in
 * operator.
 *
 * **It is fixed upstream**, and this file follows the template rather than mint-web on one point.
 * `micro-web-template/src/lib/auth.tsx:26` declares the nested shape and lines 98-99 read
 * `me?.user?.handle` / `me?.user?.roles`. The template accepts ONLY the nested shape, and its own
 * comment gives the reason: "Tolerating the flat one as a fallback would encode a response
 * identity does not send, and the next reader would not be able to tell which is real."
 * micro-mint-web does keep a flat fallback for a rollback path. Both were read; the template's
 * argument is the stronger one for a repository being written now, and there is no proxy in this
 * estate that flattens the body. `test/auth.test.ts` pins the nested read and pins the absence of
 * a flat one, so the choice is a decision rather than an omission.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import type { AccountState } from '@cloudsforge/ui'
import { AUTH_EXPIRED_EVENT, clearTokens, hasSession, nimbus, signIn, signOut } from './api.ts'

/** What identity answers at `/auth/me`, narrowed to what this app needs. */
export interface MeResponse {
  user?: {
    id?: string | null
    handle?: string | null
    roles?: readonly string[] | null
  } | null
}

export interface Customer {
  readonly handle: string | null
  readonly roles: readonly string[]
}

/**
 * Read the customer out of an `/auth/me` body.
 *
 * A pure function so `test/auth.test.ts` can prove the shape without a browser, and so the
 * nested-versus-flat mistake cannot be made silently a sixth time.
 */
export function readCustomer(body: unknown): Customer {
  const empty: Customer = { handle: null, roles: [] }
  if (typeof body !== 'object' || body === null) return empty
  const nested = (body as MeResponse).user
  if (typeof nested !== 'object' || nested === null) return empty
  return {
    handle: typeof nested.handle === 'string' && nested.handle.length > 0 ? nested.handle : null,
    roles: Array.isArray(nested.roles) ? nested.roles.filter((r): r is string => typeof r === 'string') : [],
  }
}

export type SessionStatus = 'loading' | 'anonymous' | 'signedIn'

export interface Session {
  status: SessionStatus
  account: AccountState
  customer: Customer
  signIn: (returnTo?: string) => void
  signOut: () => void
}

const SessionContext = createContext<Session | null>(null)

export function useSession(): Session {
  const value = useContext(SessionContext)
  // Throwing beats returning a signed-out default: a component rendered outside the provider would
  // otherwise show an anonymous UI to a signed-in customer and nobody would ever see why.
  if (!value) throw new Error('useSession must be used inside <AuthProvider>')
  return value
}

const NOBODY: Customer = { handle: null, roles: [] }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>(() => (hasSession() ? 'loading' : 'anonymous'))
  const [customer, setCustomer] = useState<Customer>(NOBODY)

  useEffect(() => {
    if (!hasSession()) return
    let live = true
    // The identity call is the one request that is allowed to fail quietly: an unreachable account
    // service must not sign somebody out while a live bot of theirs is running.
    nimbus<unknown>('/auth/me')
      .then((profile) => {
        if (!live) return
        setCustomer(readCustomer(profile))
        setStatus('signedIn')
      })
      .catch(() => {
        if (!live) return
        setStatus(hasSession() ? 'signedIn' : 'anonymous')
      })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    const onExpired = () => {
      clearTokens()
      setCustomer(NOBODY)
      setStatus('anonymous')
    }
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired)
  }, [])

  const doSignOut = useCallback(() => {
    setCustomer(NOBODY)
    setStatus('anonymous')
    signOut()
  }, [])

  const value = useMemo<Session>(
    () => ({
      status,
      account: {
        signedIn: status === 'signedIn',
        handle: customer.handle,
        roles: customer.roles,
      },
      customer,
      signIn,
      signOut: doSignOut,
    }),
    [status, customer, doSignOut],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

/**
 * Gate a route behind a session.
 *
 * The redirect carries the CURRENT path, search and hash, so somebody who followed a link to a
 * backtest lands back on that backtest rather than on the catalogue. It is fired from an effect
 * rather than during render because a redirect during render runs twice under StrictMode, and the
 * second one would overwrite the first's return address.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status, signIn: go } = useSession()
  const location = useLocation()

  useEffect(() => {
    if (status !== 'anonymous') return
    const back = `${window.location.origin}${location.pathname}${location.search}${location.hash}`
    go(back)
  }, [status, location.pathname, location.search, location.hash, go])

  if (status === 'loading') return <LoadingGate label="Checking your session" />
  if (status === 'anonymous') return <LoadingGate label="Taking you to sign in" />
  return <>{children}</>
}

function LoadingGate({ label }: { label: string }) {
  return (
    <div className="wt-state wt-state--loading" role="status">
      <span className="wt-spinner" aria-hidden="true" />
      <p className="wt-state__title">{label}</p>
    </div>
  )
}
