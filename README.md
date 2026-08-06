# micro-trade-web

[![ci](https://github.com/cloudsforge-online/micro-trade-web/actions/workflows/ci.yml/badge.svg)](https://github.com/cloudsforge-online/micro-trade-web/actions/workflows/ci.yml)
![licence](https://img.shields.io/badge/licence-MIT-97CA00)
![node](https://img.shields.io/badge/node-%3E%3D22-5FA04E?logo=node.js&logoColor=white)
![typescript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![module](https://img.shields.io/badge/module-ESM-F7DF1E?logo=javascript&logoColor=black)
![tests](https://img.shields.io/badge/tests-in--process%20DOM-6E56CF)

Forge Trade's browser client: the public strategy catalogue, the backtest form and the status page a
queued run is polled on, the bot list, and one bot's fills and fee settlements. It is a static bundle
served by nginx and nothing else — no server, no session store, no database.

> **Fees and slippage are charged, and this app never hides them.** The service defaults a backtest
> to 10 basis points of fee and 5 of slippage rather than to zero (`trade/src/server.ts`),
> and paper trading is charged exactly the same (`trade/src/bots.ts`) — because the frozen
> service booked a zero fee in paper mode, so "a paper bot beat the backtest of its own rule every
> time, which is the single comparison this product exists to let somebody make"
> (`trade/src/bots.ts`). Every screen that prints a figure prints what was charged to get it.
>
> **It is not an exchange.** No order book, no market making, no depth. `test/render.test.ts`
> asserts the absence of that vocabulary, and a `rules` step in CI greps for it again.
>
> **Nothing here implies a return is expected.** A backtest describes bars that have already
> happened. Every surface that shows a modelled figure carries the same sentence — *Modelled — not
> a promise.* — exported once as `MODELLED` in `src/lib/format.ts` so it cannot drift into six
> softer paraphrases across six screens.
>
> **This bundle enforces nothing, and none of its refusals are a boundary.** `trade` verifies the
> bearer on every route that needs one (`authenticate`, `trade/src/server.ts`), and every
> owned row is filtered by `user_id` inside the query — `getOwnedBot` (`trade/src/bots.ts`)
> — so another customer's bot is a **404**, the same answer as "no such bot", deliberately, so ids
> cannot be enumerated.
>
> **It stores no environment.** There is no `.env`, no `define`, no `envPrefix` and no `VITE_`
> variable anywhere: every host is resolved from `window.location` at runtime, so the image that
> passed CI is byte-for-byte the image that reaches production
> (`test/no-build-time-config.test.ts`, plus a grep in CI so deleting the test does not delete the
> rule).

## The API surface it calls

Read out of `trade/src/server.ts`, one route at a time. **The line numbers are checked
mechanically, not trusted**: `test/trade.test.ts` reads the sibling checkout and fails if any route
is not registered at the line cited here; CI fails if that cross-check did not run, and then bends
one citation by a line and requires the suite to go red.

| Method | Path | Authenticates | Idempotency-Key | What it does | Verified at |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/v1/strategies` | **no** | — | the ten rules, their parameters and their weaknesses | `trade/src/server.ts` |
| `GET` | `/v1/series` | yes | — | every published price series (estate data, not the caller's) | `trade/src/server.ts` |
| `GET` | `/v1/backtests` | yes | — | the caller's runs, newest first, at most 100 | `trade/src/server.ts` |
| `GET` | `/v1/backtests/:id` | yes | — | one run; **404** for somebody else's | `trade/src/server.ts` |
| `POST` | `/v1/backtests` | yes | **required** | **202 and a status URL. The run has not happened.** | `trade/src/server.ts` |
| `GET` | `/v1/bots` | yes | — | the caller's bots, newest first, at most 100 | `trade/src/server.ts` |
| `GET` | `/v1/bots/:id` | yes, via `ownedBot` | — | one bot | `trade/src/server.ts` |
| `GET` | `/v1/bots/:id/fills` | yes, via `ownedBot` | — | at most 200 fills, newest first | `trade/src/server.ts` |
| `GET` | `/v1/bots/:id/settlements` | yes, via `ownedBot` | — | at most 200 fee settlements | `trade/src/server.ts` |
| `POST` | `/v1/bots` | yes | **required** | creates a `draft`; reserves nothing | `trade/src/server.ts` |
| `POST` | `/v1/bots/:id/actions` | yes, via `ownedBot` | **required** | `start`, `pause`, `stop` | `trade/src/server.ts` |

### Which routes make no `authenticate()` call

**One of the routes this app calls: `GET /v1/strategies` (`trade/src/server.ts`).** The handler
is a one-line body with no principal in it, and the comment above it explains why — it is "a product
surface, the thing a prospective user reads before signing up", and gating it would make the
marketing page unable to render it. This client sends it with `auth: false`. That is not a nicety:
the estate has already shipped a client that sent a token to a route which never wanted one and then
had to reason about a 403 that was never about authorisation.

Two routes this app does **not** call are also unauthenticated in the bearer sense —
`GET /livez` and `GET /readyz` (`trade/src/server.ts`, `:309`) — plus `GET /metrics`
(`:317`). They are platform probes, not a browser surface.

`POST /v1/events` (`trade/src/server.ts`) makes no `authenticate()` call either, and it is the
one that would be most dangerous to misread: the credential is an **HMAC over the raw bytes**, and
an unsigned caller gets a **403**, not a 401 — "answering 401 would invite a caller to go and find a
token. The MAC is the credential" (`trade/src/server.ts`). A browser holds no signing secret,
so this client does not call it.

### The four routes that authenticate through a helper, which a naive check gets wrong

`GET /v1/bots/:id`, `.../fills`, `.../settlements` and `POST .../actions` contain **no literal
`await authenticate(ctx, deps)`**. They call `ownedBot(ctx, deps, SCOPE)`, which authenticates at
`trade/src/server.ts` and then answers 404 for a bot that is not the caller's (`:744-745`).

micro-mint-web's route cross-check greps each handler body for `authenticate(` — correctly, for a
service where every handler calls it directly. Run unchanged against trade, that check declares all
four routes unauthenticated, and a client built on its answer would send them no bearer and take a
401 it could not explain. So `test/trade.test.ts` records *how* each route authenticates
(`'direct' | 'ownedBot' | 'none'`) and asserts that, and pins separately that `ownedBot` still calls
`authenticate` and still scopes the lookup to the caller.

### Every mutation requires an `Idempotency-Key`

All three POSTs. `idempotencyKeyOf` runs at the top of each and throws a `BadRequestError` when the
header is missing or outside 8–200 characters (`trade/src/server.ts`), so a POST without one
is a **400**. The service's own file header gives the reason (`trade/src/server.ts`): "Every
mutating route here either moves money or commits capital, and a caller that cannot tell whether its
retry landed is a caller that will retry until something does."

**This is the opposite of `mint`, which reads no such header anywhere.** A client copied between the
two without reading the service fails every write in one direction and asserts something false in
the other. `test/trade.test.ts` asserts the requirement at the service; a `rules` step in CI counts
the three headers this client sends.

`src/lib/idempotency.ts` holds the part that is easy to get backwards — *when a key may be presented
twice*:

* **Keep it** while the outcome is unknown: a transport failure, any 5xx, or the service's own
  `idempotency_in_flight` (`trade/src/idempotency.ts`). The first attempt may have committed and
  had its answer lost; a fresh key would make the retry a second ledger reservation.
* **Drop it** the moment the outcome is known — success *or* refusal. A 400, a 404, a 409
  `bot_state`: none of them did any work, and all of them are followed by the customer changing
  something. The old key with a new body is a 409 `idempotency_key_reuse`
  (`trade/src/idempotency.ts`) that has nothing to do with what they changed.

`keepKeyAfter()` is that decision as a pure function and `test/idempotency.test.ts` walks every case.

### The 202 is the most important thing on the list

`POST /v1/backtests` validates, claims the key, writes a `queued` row and enqueues a job **after the
claim commits** (`trade/src/server.ts` — a job enqueued inside the transaction would be
visible to a worker before the row it names). It answers 202 with a `location` header and a
`statusUrl` in the body (`:468-472`). `trade/src/backtests.ts` argues the case: the frozen
service ran the backtest inside the POST, and a SIGTERM mid-run left a row marked `queued` that
nothing would ever finish.

So this app never renders a result because a button returned successfully. It renders "queued, and
nothing has been computed yet", then polls.

## Honest numbers

`trade/src/performance.ts` splits the wire types three ways and this client keeps the split:

* **amounts** are exact `bigint` Shards, sent as decimal strings;
* **proportions** are exact basis points, sent as decimal strings;
* **statistics** (Sharpe, Sortino, Calmar, CAGR) are floats, because they involve a square root and
  "nobody is paid a Sharpe".

`percent()` and `shards()` in `src/lib/format.ts` do their arithmetic on the string, in `bigint`.
Reading a proportion back through `Number` to print it would hand back exactly the rounding
`performance.ts` says it avoided — "computing max drawdown in doubles over a large equity is how a
real fall rounds to zero". `test/format.test.ts` proves it with a value past 2^53.

Two sentinels are rendered as what they mean rather than as what they are:

* **`profitFactorBps: 0`** is "gross loss was zero", not "the worst possible result" — JSON cannot
  carry Infinity, and "a reader tells the two cases apart with `losses`". A run with no losing trade
  reads *no losing trade*.
* **`metrics: null`** is "this run has not completed", not zero. The column is written only on the
  `complete` branch (`trade/src/backtests.ts`), so the list renders a dash.

## What is not served, and is therefore not drawn

A completed run computes a decimated equity curve and the full fill list and stores both, in the
`equity` and `trades` columns (`trade/src/backtests.ts`, declared at
`trade/src/migrations.ts`). **No route serves either.** `COLUMNS` at
`trade/src/backtests.ts` selects sixteen columns and neither is among them.

So the report page says the curve is not served and draws nothing. A curve interpolated between
`startEquity` and `endEquity` would be a picture of two numbers pretending to be a hundred, on a
screen whose whole job is to be believed. **Reported to micro-trade**; the day a route serves it,
this app gets a chart and this paragraph goes.

## Client routes

Declared once, in `src/lib/routes.ts`, and checked against `src/app.tsx` and `nginx.conf` by
`test/routes.test.ts`.

| Path | Screen | Session | Why |
| --- | --- | --- | --- |
| `/` | The strategy catalogue | **no** | `GET /v1/strategies` makes no `authenticate()` call |
| `/backtests` | Your runs | yes | `GET /v1/backtests` authenticates |
| `/backtests/new` | Queue a run | yes | `POST /v1/backtests` authenticates |
| `/backtests/:id` | One run, and its report | yes | the address the 202's `location` names |
| `/bots` | Your bots | yes | `GET /v1/bots` authenticates |
| `/bots/new` | Create a bot | yes | `POST /v1/bots` authenticates |
| `/bots/:id` | One bot: fills, settlements, actions | yes | `ownedBot` authenticates |

**An unknown address answers 404, not 200.** `nginx.conf` enumerates `backtests` and `bots` and lets
everything else fall through to `error_page 404 /index.html`, which serves the same bundle while
keeping the status. The usual `try_files $uri /index.html` would make "page not found" a success
that crawlers index and monitors call healthy — and a deploy that dropped a route would look exactly
like a deploy that did not.

## The refusals this app renders rather than pre-empts

Three of the service's `409 bot_state` answers (`BotStateError` → `trade/src/server.ts`):

| Refusal | Where it is decided | What this app does |
| --- | --- | --- |
| a stopped bot cannot be restarted | `trade/src/bots.ts` | hides Start on a stopped bot and says stop is terminal — a button that can only 409 teaches a customer the product is unreliable |
| a live bot cannot start while the kill switch is off | `trade/src/bots.ts` | **offers the button and renders the refusal in full** |
| only a running bot can be paused | `trade/src/bots.ts` | disables Pause off `bot.status` |

The middle one is the interesting case. `TRADE_LIVE_ENABLED` defaults to **false**
(`trade/src/env.ts`) and is read on every tick rather than at boot — a kill switch that only
applied to bots that do not exist yet is not a kill switch (`trade/src/env.ts`). **No route
reports the setting**, so this bundle cannot know it in advance. Hiding the live option would remove
a feature nobody could file a bug against on a deployment where live was on. So the form says
plainly that it cannot check, and the 409 is rendered where the button is. **Reported to
micro-trade**: a read-only capability route would let a client stop offering a mode that will 409.

`pause` is **not a flatten** — the position stays open by design (`trade/src/bots.ts`) — and
the page says so, because "paused" alone reads as "flat" to most people.

## Design tokens

Every `--cf-*` this stylesheet names is declared in `ui/packages/ui/src/tokens.css`, and
`test/tokens.test.ts` proves it against the sibling checkout. An undefined custom property makes the
whole declaration invalid at computed-value time, so `border: 1px solid var(--cf-nope)` removes the
border silently, in a file that looks correct.

The names that exist, and the plausible ones that do not:

| Use | Real | Not a token |
| --- | --- | --- |
| borders | `--cf-line`, `--cf-line-strong` | `--cf-border` |
| states | `--cf-success`, `--cf-warn`, `--cf-danger` | `--cf-status-good/-warn/-crit`, `--cf-critical`, `--cf-warning` |
| radii | `--cf-radius-sm`, `--cf-radius`, `--cf-radius-lg` | `--cf-radius-md` |
| spacing | `--cf-space-3xs` … `--cf-space-3xl` | `--cf-space-1` … `--cf-space-5` |
| type | `--cf-font-sans`, `--cf-font-mono`, `--cf-font-display` | `--cf-font` |

A `var(--undefined, #hex)` is not a repair: it is a hard-coded colour wearing a token's clothes, and
it stops following the substrate the moment the ash ramp changes. `test/tokens.test.ts` refuses any
`var()` fallback and any literal colour in `src/styles.css`.

## Configuration

**There is none, and that is the point.** No `.env`, no build argument for an API URL, no
`import.meta.env`. Two inputs exist and neither is configuration:

| Input | Where | What it is |
| --- | --- | --- |
| `RELEASE` | `Dockerfile` build arg | the git sha, written into a `<meta name="cf-release">` tag and read by `src/lib/obs.ts` so an error report names the deploy that produced it. It identifies the artefact; it does not tell it where it is running. |
| `window.location` | the browser | every CloudsForge host, resolved per call through `cloudsforgeHosts()` from `@cloudsforge/ui` |

### The dev port disagreement

The surface registry gives `trade` **devPort 4006** (`ui/packages/ui/src/surfaces.ts`). The
`trade` service binds **4000**: `trade/src/env.ts` defaults `PORT` to 4000 and
`trade/.env.example:44` sets it to 4000.

This is **not** fixed with a literal port in this repository. A hard-coded host is a second,
unversioned copy of the registry and the copy is the one that goes stale. It is the fifth instance
of the same shape — `admin` (registry 3002, `admin-api` binds 4014), `emberkin` (registry 3014,
service binds 4100), `create` (registry 4004, `mint` binds 4000) — and trade's 4000 is the
service-template default that half the estate shares, so the registry genuinely cannot carry every
service's bound port and the entry really is an allocation. What is missing is anything that makes
it true. So:

```bash
PORT=4006 pnpm dev      # in micro-trade, so it answers where the registry says it does
```

`test/hosts.test.ts` pins both halves and this line, so the day either moves the suite fails and
names the other. Reported to micro-ui, whose file the registry is. None of it is visible in
production: the bundle and the service share `trade.<apex>` there, so every request is relative.

## Running it

```bash
pnpm install
pnpm dev                # http://localhost:5186 — Vite's port, NOT the registry's
```

Vite's 5186 is where the *bundle* is served; the registry's 4006 is where the *API* answers. The two
are different things and admin-web had to draw the distinction after its own entry was read as the
first. Start the service alongside:

```bash
cd ../trade && PORT=4006 pnpm dev
```

Checks:

```bash
pnpm typecheck
pnpm test               # the cross-repository half SKIPS without a micro-trade checkout
pnpm build
```

The route cross-check needs the service's source. It looks for it, in order, at
`$CLOUDSFORGE_TRADE_DIR`, `../trade/src/server.ts`, then `./.trade/src/server.ts`. Without one it
prints `SKIPPED: no micro-trade checkout` rather than passing quietly, and CI makes that fatal.
`test/tokens.test.ts` does the same for `../ui/packages/ui/src/tokens.css`.

The image, which is the artefact that actually ships:

```bash
docker build -t trade-web --build-context uipkg=../ui .
docker run --rm -p 8080:8080 trade-web
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/nope   # must be 404
```

## The one temporary thing

`@cloudsforge/ui` is unpublished, so `package.json` consumes it as `link:../ui/packages/ui`. Three
things exist only because of that and are deleted together the day it is published: the second build
context in the `Dockerfile`, the `micro-ui` checkout in `ci.yml`, and the `check`/`image` jobs
themselves, which are then replaced by a call to `micro-org`'s reusable `web-ci.yml`. Two of that
workflow's assumptions will still not suit this repository — it requires a 200 for any deep link,
and it checks out no sibling service — so `build-image: false` goes with the move and the route
cross-check stays local until the reusable workflow grows the input.

## Known gaps, and defects found elsewhere

Recorded rather than fixed from here, because a quiet omission is a trap for the next person.

**In this repository**

* No equity curve, for the reason above: the data exists and is not served.
* ~~No `robots.txt` and no sitemap.~~ Closed. `nginx.conf` now serves both, composed from `$host`
  per request so no hostname is baked into the image, and `test/sitemap.test.ts` regenerates
  `robots.txt` from `@cloudsforge/ui/sitemap` and checks every `<loc>` against this repository's own
  route table. The sitemap lists ONLY `/` — the one route `src/lib/routes.ts` marks public, because
  `GET /v1/strategies` is the one endpoint the service leaves unauthenticated. It is deliberately
  NOT the estate sitemap: `$host` here is already `trade.<apex>`, so the shared `sitemapXml()` would
  compose `foresight.trade.<apex>`, which nothing resolves. That document belongs to the apex.
* The bot detail page polls only when the customer presses a button. A running bot's equity moves
  on the service's tick; this app does not follow it live.

**In `micro-trade`** *(reported, not touched)*

* `GET /v1/backtests/:id` serves no equity curve or fill list, though both are computed and stored
  (`trade/src/backtests.ts` versus `:227-228`). Without them a client cannot show a customer
  *when* a drawdown happened, only how deep it was.
* No route reports whether `TRADE_LIVE_ENABLED` is on (`trade/src/env.ts`). A client therefore
  cannot tell a customer that starting a live bot will fail until they have already created it.

**In `micro-mint-web`** *(reported, not touched)*

* `src/styles.css` reads ten custom properties that `ui/packages/ui/src/tokens.css` does not
  declare — `--cf-border`, `--cf-radius-md`, `--cf-space-1` … `--cf-space-5`, `--cf-status-good`,
  `--cf-status-warn`, `--cf-status-crit` — across **72 declarations**. Three are written
  `var(--cf-status-good, var(--cf-border))`, where the fallback is undefined too. Every affected
  declaration is dropped by the browser, so those borders, radii, paddings and status colours are
  simply absent. Every other frontend in the estate — `micro-admin-web`, `micro-web-template`,
  `micro-hub-web`, `micro-market-web`, `micro-status-web`, `micro-foresight-web` — is clean, so this
  is one repository's drift rather than a template defect. `test/tokens.test.ts` here is the check
  that would have caught it.

**In `micro-foresight-web`** *(inherited report, re-checked)*

* `index.html` declares `og:type`, `og:title` and `og:description` twice. The second set wins in
  every crawler and the first is dead text nobody edits. `test/brand-chrome.test.ts` here counts
  each property so the same thing cannot happen in this repository.

---

## Provenance

The code in this repository was written by **Claude Opus 5** and **Claude Fable 5**, assets
generated with **FLUX 2 Pro**, under human direction and review.
