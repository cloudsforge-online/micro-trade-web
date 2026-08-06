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
 * (`trade/src/server.ts:349`) makes no `authenticate()` call at all, and it carries a comment
 * saying why — a catalogue behind a token cannot be read by the person deciding whether to sign
 * up. Putting it behind `ProtectedRoute` would send a visitor to sign in for a page the service
 * would have served them, which is the same class of mistake as sending a bearer token to a route
 * that never wanted one.
 *
 * The other two authenticate, so they are gated. The gate is NOT the security boundary — trade
 * verifies the bearer itself (`trade/src/server.ts:786-792`) and every owned row is filtered by
 * `user_id` in the query, so another customer's bot is a 404 (`trade/src/bots.ts:217-223`).
 */
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/shell.tsx'
import { AuthProvider, ProtectedRoute } from './lib/auth.tsx'
import { placementIsKnown } from './lib/hosts.ts'
import { StrategiesPage } from './pages/strategies.tsx'
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
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<AppShell unregistered={unregistered} />}>
            {/* Public: the strategy catalogue is what an unsigned-in visitor arrived to read. */}
            <Route index element={<StrategiesPage />} />
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
