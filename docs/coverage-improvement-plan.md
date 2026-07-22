# E2E / Test Coverage Improvement Plan

_Generated 2026-07-22. Baseline measured from a real coverage run (fast e2e lane, chromium, 59/59 passing)._

## Baseline (measured, not estimated)

Fast e2e lane, chromium only, `--grep-invert @slow`, 59 tests, run against `BUILD_TARGET=node` dev server:

| Metric      | Coverage | Uncovered |
|-------------|----------|-----------|
| Statements  | 73.5%    | 1,100     |
| Functions   | 62.6%    | 436       |
| **Branches**| **46.8%**| **982**   |

**The weak axis is branches: ~half of all conditional paths are never exercised.** Statements/lines look healthy because happy-path flows touch most lines once; branches stay low because the `else`/`catch`/error forks are never taken.

> Note: these numbers are the *fast lane only*. The `@slow` WASM lane and the mobile-chrome project are excluded, so real analysis-completion and mobile-specific branches are undercounted here. The committed full-suite figure was ~72% lines / 47% branches — consistent.

## Where the cold branches actually live

Ranked by branch density in the logic layer (branch points / lines):

| File | Branch points | Lines | Nature of cold paths |
|------|---------------|-------|----------------------|
| `src/lib/services/BackendAnalysisRunner.js` | 112 | 704 | socket timeout, reconnection status forks (`completed`/`running`/`queued`/`not_found`), param-validation timeout, error handlers |
| `src/stores/analyses.js` | 57 | — | state transitions, error/failed job handling, persistence edge cases |
| `src/lib/services/HyPhyAnalysisRunner.js` | 33 | 440 | WASM error handling, output-parse failures |
| `src/lib/services/BaseAnalysisRunner.js` | 30 | 218 | shared error/tracking branches |
| `src/lib/BranchSelector.svelte` | 34 | 779 | group validation, mobile pointer edge cases |
| `src/lib/FileManager.svelte` | 30 | 367 | invalid file, multi-file, format edge cases |
| `src/lib/AnalysisHistory.svelte` | 21 | 253 | empty/failed/orphaned history rendering |

The existing unit suite (30+ `*-backend.test.js` files) already covers **happy-path server param building** well. It does **not** cover the runner *error branches* or store *state-transition* branches — that's the gap.

## Strategy: right tool per layer

Branch coverage doesn't come from more e2e — e2e is slow and can't easily force error states (dropped sockets, malformed backend responses). Split the work by layer:

- **Logic/service/store branches → fast unit tests (vitest).** Mock the socket / backend response, drive each status fork and catch block directly. Cheap, fast, deterministic. This is where the biggest branch % gains are.
- **UI interaction branches → e2e (Playwright).** Only for branches that genuinely need the rendered app: invalid-file toasts, backend-unavailable banner, empty-history state, mobile layout.

## Phased path

### Phase 0 — tooling (½ day)
- Add `test:coverage` npm script (`vitest run --coverage`) — there isn't one today; unit coverage is manual.
- Add a combined coverage view (merge unit lcov + e2e lcov) so we track one number.
- Wire a coverage summary into CI output (no gate yet — just visibility).
- **Exit:** one command prints current unit+e2e branch %.

### Phase 1 — runner error branches (2–3 days, biggest win)
Target `BackendAnalysisRunner.js`, `BaseAnalysisRunner.js`, `HyPhyAnalysisRunner.js`.
- Unit tests with a mocked socket.io client covering: connection timeout, reconnection to each job status (`completed` / `running` / `queued` / `not_found`), param-validation timeout, mid-analysis error, disconnect/reconnect.
- **Est. impact:** these three files hold ~175 branch points, mostly cold → largest single branch-% jump.
- **Exit:** runner branch coverage >80%.

### Phase 2 — store state transitions (1–2 days)
Target `src/stores/analyses.js` (57 branch points).
- Unit-test the reducers/actions: add/update/remove, failed-job handling, IndexedDB persistence success + failure, concurrent updates, page-refresh rehydration.
- Some coverage already exists (`analysis-store-counts`, `concurrent-state-management`, `page-refresh-handling`) — extend, don't duplicate.
- **Exit:** store branch coverage >80%.

### Phase 3 — UI failure-path e2e (2–3 days)
New/extended specs for branches only reachable through the UI:
- Invalid / malformed / oversized file → correct toast + no crash (partly in spec 04).
- Backend-unavailable banner + retry (spec 11 exists — extend to the reconnect path).
- Empty and failed analysis-history rendering.
- Mobile-chrome project: currently underexercised — add the mobile lane to the coverage run so those branches count.
- **Exit:** these components' branch coverage >70%.

### Phase 4 — ratchet + guard (½ day)
- Turn on a coverage floor in CI at the *newly achieved* branch % (e.g. 65%), ratcheting only upward, so it can't regress.
- Document the split (unit = logic branches, e2e = UI branches) in `e2e/README` so new work lands in the right layer.

## Progress (measured)

| Phase | Status | Result |
|-------|--------|--------|
| 0 — tooling | ✅ done | `test:coverage` script + vitest coverage config added |
| 1 — runner error branches | ✅ done | `BackendAnalysisRunner.js` branches 57%→73%, functions 46%→79%; `HyPhyAnalysisRunner.js` 0%→100% branches |
| 2 — store transitions | ✅ done | `analyses.js` statements 74%→87%, functions 67%→81%, branches 59%→67% |
| 3 — UI failure-path e2e | pending | — |
| 4 — CI ratchet | pending | — |

Unit suite: 252 → 293 tests. Logic-layer (`src/lib`+`src/stores`) branch coverage 63.6% → 67.6% after Phases 1–2. All green; no new lint errors (the two `vite.config.ts` proxy lint errors and the broken `test:backend` script both pre-date this work).

Key finding from Phase 1: the previous `reconnection-handling.test.js` "BackendAnalysisRunner" block was a placeholder — it asserted on literals and never executed the runner. The new `runner-reconnect-errors.test.js` actually mocks socket.io + IndexedDB and exercises the code.

## Realistic target

Branch coverage **47% → ~68–72%** over ~2 weeks, dominated by Phases 1–2 (fast unit tests on the runner + store error paths). Lines/statements will drift up as a side effect but aren't the goal — the point is exercising the failure forks where bugs hide.

## How to reproduce the baseline

```bash
# dev server must be on :5173 with node target (coverage entryFilter hardcodes 5173)
BUILD_TARGET=node npm run dev            # in one shell
E2E_COVERAGE=1 E2E_NO_WEBSERVER=1 npx playwright test --project=chromium --grep-invert @slow
# report: coverage-e2e/report.html  (coverage-e2e/ is gitignored)
```
