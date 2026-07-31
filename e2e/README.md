# E2E tests & the test-coverage layer split

Playwright specs live here; unit tests live under `src/test`, `src/lib/**`, and
`src/stores/**`. Coverage is tracked for both. When you add a test, put it in the
layer that can exercise the branch **deterministically** — this keeps the suite
fast and the coverage meaningful.

## Which layer for which branch

| Branch type | Layer | Why |
|-------------|-------|-----|
| Service/runner error paths (dropped socket, malformed backend response, reconnection status forks, timeouts) | **Unit** (`src/test`, vitest) | Mock `socket.io-client` + IndexedDB and force the state directly. Fast, deterministic — you can't reliably drop a socket mid-run from the browser. See `src/test/runner-reconnect-errors.test.js`. |
| Store state transitions (create/update/delete/cancel + their storage-rejects forks) | **Unit** | Mock `analysisStorage`, assert store state. See `src/test/store-crud-lifecycle.test.js`. |
| Pure logic (param mapping, validation, format detection) | **Unit** | No DOM needed. |
| UI rendering that depends on component state (status badges, failure-state cards, empty states, toasts) | **E2E** (Playwright) | Needs the real rendered app. Seed IndexedDB via `seedAnalysisWithStatus` / `seedCompletedAnalysis` in `fixtures/helpers.js`, then assert. See `17-analysis-failure-states.spec.js`. |
| Full user flows (upload → configure → run → results) | **E2E** | Integration across many components. |

Rule of thumb: if you'd have to fake a DOM event or a rendered component to test
it, it's E2E. If you'd have to stand up the whole app to force an error state
that a mock can produce in one line, it's unit.

## Coverage

- **Unit:** `npm run test:coverage` — writes `coverage-unit/`, and **fails** if
  coverage drops below the floors in `vite.config.ts`
  (`test.coverage.thresholds`). This is the ratchet: raise the floors as coverage
  improves; never lower them to make a red build green.
- **E2E:** `E2E_COVERAGE=1 E2E_NO_WEBSERVER=1 npx playwright test` against a dev
  server started with `BUILD_TARGET=node npm run dev` on port 5173 (the coverage
  `entryFilter` in `playwright.config.js` hardcodes 5173). Writes
  `coverage-e2e/`.

See `docs/coverage-improvement-plan.md` for the measured baseline and the phased
plan behind these tests.

## Dev-server gotcha (RHEL 9 / glibc)

The default `npm run dev` uses `@sveltejs/adapter-cloudflare`, whose
Miniflare/`workerd` binary needs a newer glibc than some hosts have — every SSR
request to `/` then 500s and all e2e tests fail. Use
`BUILD_TARGET=node npm run dev` (svelte.config.js branches to `adapter-node`).
