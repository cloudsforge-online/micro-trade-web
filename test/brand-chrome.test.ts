/**
 * A frontend ships its own browser chrome, or it ships none at all.
 *
 * FOUR FINISHED FRONTENDS SHIPPED WITH NO FAVICON AT ALL and went green in CI, because nothing
 * anywhere asserted that a page has an icon (18-build-status.md §3.3e). The checks below are the
 * template's, kept in both directions and unweakened.
 *
 * ── This surface DOES ship an og card, and that is the decision rather than the default ────────
 *
 * `micro-admin-web` asserts the deliberate ABSENCE of one, because §3.3k recorded that nobody
 * shares an operator console outward. The same paragraph draws the opposite conclusion for public
 * surfaces. `brand/assets/trade/` holds `og-1200x630.png` — a full set was checked before anything
 * was assumed — so it is shipped, linked, and asserted here in both directions, so removing it
 * later fails the build.
 *
 * ── And the icons must reach the IMAGE, not only the repository ────────────────────────────────
 *
 * The last two tests are the ones that matter most. The web template's Dockerfile once did not
 * copy `public/`, so every frontend cut from it built an image whose `dist/` had no icons — while
 * a test exactly like this one passed, because it reads the SOURCE tree. That is fixed upstream
 * (`micro-web-template/Dockerfile:39`, read for this repository rather than taken on a sibling's
 * word), so the tests below are a guard rather than a correction. They are still worth their
 * lines: reading a Dockerfile is not evidence that an image serves a file, which is why the second
 * of them requires CI to CURL the running container.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { BASE } from '../src/lib/routes.ts'

const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url))
const HTML = readFileSync(at('index.html'), 'utf8')

/** The sizes a browser and an install prompt actually ask for. */
const REQUIRED_ICONS = ['favicon-32x32.png', 'favicon-192x192.png']

/** The card a chat client, a search result and a social post render. */
const OG_CARD = 'og-1200x630.png'

test('the icons a browser asks for are present in public/', () => {
  const missing = REQUIRED_ICONS.filter((f) => !existsSync(at(`public/${f}`)))
  assert.deepEqual(
    missing,
    [],
    `public/ is missing ${missing.join(', ')} — copy them from micro-brand's assets/trade/`,
  )
})

test('index.html links every icon it ships, and ships every icon it links', () => {
  // Both directions. A link to a file that is not there is a 404 in every tab; a file nobody links
  // is dead weight that looks like it is working.
  for (const f of REQUIRED_ICONS) {
    assert.ok(HTML.includes(f), `index.html does not link /${f}`)
  }
  for (const m of HTML.matchAll(/href="\/(favicon[^"]*)"/g)) {
    assert.ok(existsSync(at(`public/${m[1]}`)), `index.html links /${m[1]}, which is not in public/`)
  }
})

test('the icons are this surface’s own, not the template’s placeholders', () => {
  // The template ships the company marks so that a freshly cut frontend is never iconless. Leaving
  // them in place passes every check above and puts the wrong brand in the tab.
  const brand = '../brand/assets/trade'
  for (const icon of [...REQUIRED_ICONS, 'favicon-512x512.png', OG_CARD]) {
    const source = at(`${brand}/${icon}`)
    if (!existsSync(source)) continue
    assert.deepEqual(
      readFileSync(at(`public/${icon}`)),
      readFileSync(source),
      `public/${icon} is not the byte-identical copy from brand/assets/trade/`,
    )
  }
})

test('the og card is shipped, because this surface’s links are shared outward', () => {
  assert.ok(existsSync(at(`public/${OG_CARD}`)), `public/${OG_CARD} is missing`)
  assert.match(HTML, /property="og:image"/, 'index.html declares no og:image')
  assert.match(HTML, /property="og:title"/, 'index.html declares no og:title')
  assert.match(HTML, /property="og:description"/, 'index.html declares no og:description')
})

test('the og:image is a RELATIVE path, so the card resolves against whichever origin served it', () => {
  // An absolute one would be a hostname baked into the bundle — the exact thing this repository
  // has no build-time configuration in order to avoid.
  const m = /property="og:image"\s+content="([^"]+)"/.exec(HTML)
  assert.ok(m, 'no og:image content')
  assert.ok(m[1]?.startsWith('/'), `og:image is ${m[1]}, which is not a relative path`)
  // ── THE MOUNT COMES OFF BEFORE THE DISK ──────────────────────────────────────────────────
  // index.html names the PUBLIC address, `<BASE>/og-1200x630.png`, and it has to: vite does
  // not rewrite `content` against `base`, so a root-relative one would survive the build and
  // resolve to MICRO-SITE's card on the apex. The file itself is at `public/og-1200x630.png`
  // — that folder is made by the Dockerfile's COPY, not by this tree.
  const onDisk = (m[1] as string).startsWith(`${BASE}/`) ? (m[1] as string).slice(BASE.length) : (m[1] as string)
  assert.ok(existsSync(at(`public${onDisk}`)), `og:image points at ${m[1] as string}, not in public/ (looked for public${onDisk})`)
})

test('the og metadata is declared ONCE', () => {
  // foresight-web/index.html declares og:type, og:title and og:description twice. The second set
  // silently wins in every crawler and the first is dead text that nobody edits. Reported there.
  for (const property of ['og:type', 'og:title', 'og:description', 'og:image']) {
    const count = [...HTML.matchAll(new RegExp(`property="${property}"`, 'g'))].length
    assert.equal(count, 1, `${property} is declared ${count} times`)
  }
})

test('the shared card promises nothing', () => {
  // A social card is read WITHOUT the surrounding page, which makes it the easiest place in the
  // whole product to imply a return by accident. So it carries no figure and no future tense, and
  // it says the results are modelled.
  const description = /property="og:description"\s+content="([^"]+)"/.exec(HTML)?.[1] ?? ''
  assert.ok(description.length > 0, 'no og:description')
  assert.doesNotMatch(description, /\d+\s*%/, 'the shared card quotes a percentage')
  assert.doesNotMatch(
    description,
    /\b(guarantee|guaranteed|profit|earn|returns? of|will make|beat the market)\b/i,
    'the shared card makes a promise',
  )
  assert.match(description, /modelled/i, 'the shared card does not say the results are modelled')
})

test('index.html does NOT tell crawlers to stay away', () => {
  // The mirror of admin-web's assertion, and the reason this file differs from that one. A noindex
  // here would suppress the strategy catalogue this product exists to have read.
  assert.doesNotMatch(HTML, /name="robots"[^>]*noindex/)
})

test('public/ holds no stray brand asset that nothing links', () => {
  // A file nobody links is dead weight that looks like it is working, and this is how an old
  // product's mark survives a rebrand in one repository.
  const linked = new Set([...HTML.matchAll(/(?:href|content)="\/([^"]+\.png)"/g)].map((m) => m[1]))
  const stray = readdirSync(at('public')).filter((f) => f.endsWith('.png') && !linked.has(f))
  assert.deepEqual(stray, [], `public/ holds ${stray.join(', ')}, which index.html does not link`)
})

test('the accent and substrate are declared on <html>, before React can paint', () => {
  // Set by React, the page paints the default ember and then changes colour. `trade` has its own
  // block in tokens.css (`ui/packages/ui/src/tokens.css`); admin's did not, and the console
  // wore the company's colour by accident for as long as that was true.
  assert.match(HTML, /data-cf-product="trade"/)
  assert.match(HTML, /data-cf-substrate="warm"/)
})

test('the accent selector this page names really exists in tokens.css', () => {
  // The check that would have caught admin's. A `data-cf-product` with no matching block is not an
  // error anywhere — the page simply inherits the company ember and nothing says so.
  const tokens = at('../ui/packages/ui/src/tokens.css')
  if (!existsSync(tokens)) return // the sibling design system is not checked out; CI has it.
  assert.match(readFileSync(tokens, 'utf8'), /\[data-cf-product='trade'\]/)
})

test('the Dockerfile copies public/ into the build context', () => {
  // Without it Vite has no publicDir to copy into dist, and the image ships with no icons at all
  // while this very test passes, because it reads the SOURCE tree. That is how four frontends
  // shipped iconless. Fixed in the template at micro-web-template/Dockerfile:39; pinned here so it
  // cannot be lost again, and backed by the container probe below, which is the only check that
  // could have caught it in the first place.
  const dockerfile = readFileSync(at('Dockerfile'), 'utf8')
  assert.match(
    dockerfile,
    /^COPY public \.\/public$/m,
    'the Dockerfile does not copy public/, so the built image will have no favicon',
  )
})

test('CI probes the running container for the icons AND the card', () => {
  // The test above reads a file; only a request to the image proves the artefact serves them.
  const ci = readFileSync(at('.github/workflows/ci.yml'), 'utf8')
  for (const asset of [...REQUIRED_ICONS, OG_CARD]) {
    assert.ok(ci.includes(asset), `ci.yml does not probe /${asset} against the image`)
  }
})
