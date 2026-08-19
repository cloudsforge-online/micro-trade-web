/**
 * The route table.
 *
 * Two facts about it are enforced elsewhere and must stay in agreement with it: `ROUTES` in
 * lib/routes.ts is the declaration the navigation is derived from, and nginx.conf enumerates the
 * same paths so that an address which is NOT here answers 404 rather than 200.
 *
 * ── Which routes are gated is read off the SERVICE, not chosen ────────────────────────────────
 *
 * One of the three is public because trade made it public: `GET /v1/strategies`
 * (`trade/src/server.ts`) makes no `authenticate()` call at all, and it carries a comment
 * saying why — a catalogue behind a token cannot be read by the person deciding whether to sign
 * up. Putting it behind `ProtectedRoute` would send a visitor to sign in for a page the service
 * would have served them, which is the same class of mistake as sending a bearer token to a route
 * that never wanted one.
 *
 * Everything else authenticates, so it is gated — including the market list, the depth ladder and
 * the public tape, which are not private information but are served through `reader()`
 * (`trade/src/server.ts`), and `reader()` authenticates before it does anything else. The gate is
 * NOT the security boundary — trade verifies the bearer itself and every owned row is filtered by
 * `user_id` in the query, so another customer's bot is a 404 (`trade/src/bots.ts`) and another
 * customer's order is a 404 (`trade/src/orders.ts`).
 */
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ScrollToTop } from './components/scroll-to-top.tsx'
import { AppShell } from './components/shell.tsx'
import { AuthProvider, ProtectedRoute } from './lib/auth.tsx'
import { placementIsKnown } from './lib/hosts.ts'
import { BASE } from './lib/routes.ts'
import { StrategiesPage } from './pages/strategies.tsx'
import { MarketsPage } from './pages/markets.tsx'
import { MarketPage } from './pages/market.tsx'
import { OrdersPage } from './pages/orders.tsx'
import { OrderPage } from './pages/order.tsx'
import { BalancesPage } from './pages/balances.tsx'
import { BacktestsPage } from './pages/backtests.tsx'
import { NewBacktestPage } from './pages/new-backtest.tsx'
import { BacktestPage } from './pages/backtest.tsx'
import { BotsPage } from './pages/bots.tsx'
import { NewBotPage } from './pages/new-bot.tsx'
import { BotPage } from './pages/bot.tsx'
import { NotFoundPage } from './pages/not-found.tsx'

export function App() {
  const unregistered = !placementIsKnown()

  return (
    <BrowserRouter basename={BASE}>
      <ScrollToTop />
      <AuthProvider>
        <Routes>
          <Route element={<AppShell unregistered={unregistered} />}>
            {/* Public: the strategy catalogue is what an unsigned-in visitor arrived to read. */}
            <Route index element={<StrategiesPage />} />
            {/* The exchange. `:symbol` rather than `:id` because a market is addressed by the name
                a customer reads — `EMBER-USD`, not a uuid — and that name is what the depth, tape
                and candle reads all take. */}
            <Route
              path="markets"
              element={
                <ProtectedRoute>
                  <MarketsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="markets/:symbol"
              element={
                <ProtectedRoute>
                  <MarketPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="orders"
              element={
                <ProtectedRoute>
                  <OrdersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="orders/:id"
              element={
                <ProtectedRoute>
                  <OrderPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="balances"
              element={
                <ProtectedRoute>
                  <BalancesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="backtests"
              element={
                <ProtectedRoute>
                  <BacktestsPage />
                </ProtectedRoute>
              }
            />
            {/* Declared before the wildcard sibling so `new` is never read as an id. React Router
                ranks a static segment above a dynamic one regardless, but the order says so. */}
            <Route
              path="backtests/new"
              element={
                <ProtectedRoute>
                  <NewBacktestPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="backtests/:id"
              element={
                <ProtectedRoute>
                  <BacktestPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="bots"
              element={
                <ProtectedRoute>
                  <BotsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="bots/new"
              element={
                <ProtectedRoute>
                  <NewBotPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="bots/:id"
              element={
                <ProtectedRoute>
                  <BotPage />
                </ProtectedRoute>
              }
            />
            {/* Unknown paths render inside the shell, so the reader keeps the navigation they need
                to get back out — under a real 404, which nginx.conf preserves. */}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
