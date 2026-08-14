/**
 * Video Segment Generator for Datamonkey 3 Announcement Video
 *
 * Records video clips corresponding to the narration script's scenes.
 * Run with: npx playwright test e2e/video-frames.spec.js --reporter=list
 *
 * Videos are saved to test-results/(test-name)/video.webm
 * After running, collect them into video-frames/ with the provided copy-videos.sh script.
 */

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// 1920x1080 with video recording enabled
test.use({
	viewport: { width: 1920, height: 1080 },
	colorScheme: 'light',
	video: {
		mode: 'on',
		size: { width: 1920, height: 1080 }
	}
});

// Generous timeout — scenes have deliberate pauses for cinematic pacing
test.setTimeout(120000);

const OFFSET_DIR = path.resolve('video-frames/offsets');
fs.mkdirSync(OFFSET_DIR, { recursive: true });

async function waitForAppReady(page) {
	await page.waitForFunction(
		() => {
			const loading = document.querySelector('[data-testid="loading"]');
			return !loading || loading.textContent?.includes('HyPhy');
		},
		{ timeout: 60000 }
	);
	await page.waitForSelector('.sample-card, button:has-text("Data")', { timeout: 60000 });
}

// Loads the app and records the wall-clock offset (in seconds) at which the
// HyPhy loading screen finished. Used by the trim step to cut the loading
// portion off the front of each video.
async function prepareScene(page, sceneName) {
	const start = Date.now();
	await page.goto('/');
	await waitForAppReady(page);
	const offsetSeconds = (Date.now() - start) / 1000;
	fs.writeFileSync(
		path.join(OFFSET_DIR, `${sceneName}.json`),
		JSON.stringify({ scene: sceneName, offsetSeconds })
	);
}

// Smooth scroll for cinematic feel
async function smoothScroll(page, distance, durationMs = 1500) {
	await page.evaluate(
		({ distance, durationMs }) => {
			return new Promise((resolve) => {
				const start = window.scrollY;
				const startTime = performance.now();
				function step(now) {
					const elapsed = now - startTime;
					const progress = Math.min(elapsed / durationMs, 1);
					const ease =
						progress < 0.5
							? 2 * progress * progress
							: -1 + (4 - 2 * progress) * progress;
					window.scrollTo(0, start + distance * ease);
					if (progress < 1) requestAnimationFrame(step);
					else resolve();
				}
				requestAnimationFrame(step);
			});
		},
		{ distance, durationMs }
	);
}

// Smooth mouse move to an element (for hover effects on camera)
async function smoothMoveTo(page, locator) {
	const box = await locator.boundingBox();
	if (!box) return;
	const x = box.x + box.width / 2;
	const y = box.y + box.height / 2;
	await page.mouse.move(x, y, { steps: 20 });
}

// ---------- SCENE 1: APP REVEAL ----------

test('scene-01 — app reveal and first impression', async ({ page }) => {
	await prepareScene(page, 'scene-01');

	// Hold on the clean landing
	await page.waitForTimeout(3000);

	// Slow scroll to show the full page
	await smoothScroll(page, 400, 2000);
	await page.waitForTimeout(2000);

	await smoothScroll(page, -400, 1500);
	await page.waitForTimeout(1500);
});

// ---------- SCENE 2: THREE-TAB NAVIGATION ----------

test('scene-02 — navigating Data Analyze Results tabs', async ({ page }) => {
	await prepareScene(page, 'scene-02');

	// Load a file so all tabs have content
	const fileCard = page.locator('.sample-card').filter({ hasText: 'CD2-slim.fna' });
	await fileCard.click();
	await page.waitForTimeout(4000);

	// Pause on Data
	await page.waitForTimeout(2000);

	// Click Analyze
	await page.locator('button:has-text("Analyze")').first().click();
	await page.waitForTimeout(3000);

	// Click Results
	await page.locator('button:has-text("Results")').first().click();
	await page.waitForTimeout(3000);

	// Back to Data
	await page.locator('button:has-text("Data")').first().click();
	await page.waitForTimeout(2000);
});

// ---------- SCENE 3: DATA INPUT WALKTHROUGH ----------

test('scene-03 — loading a file and exploring validation', async ({ page }) => {
	await prepareScene(page, 'scene-03');
	await page.waitForTimeout(1500);

	// Hover over demo file cards
	const cd2Card = page.locator('.sample-card').filter({ hasText: 'CD2-slim.fna' });
	await smoothMoveTo(page, cd2Card);
	await page.waitForTimeout(800);

	const smallCard = page.locator('.sample-card').filter({ hasText: 'small.nex' });
	await smoothMoveTo(page, smallCard);
	await page.waitForTimeout(800);

	// Click CD2-slim
	await smoothMoveTo(page, cd2Card);
	await page.waitForTimeout(400);
	await cd2Card.click();
	await page.waitForTimeout(4000);

	// Scroll to show file metrics, alignment viewer, warnings
	await smoothScroll(page, 500, 2500);
	await page.waitForTimeout(2500);

	await smoothScroll(page, 300, 2000);
	await page.waitForTimeout(2000);

	// Back to top
	await smoothScroll(page, -800, 2000);
	await page.waitForTimeout(1500);
});

// ---------- SCENE 4: TREE VISUALIZATION ----------

test('scene-04 — tree visualization from NEXUS file', async ({ page }) => {
	await prepareScene(page, 'scene-04');

	const nexCard = page.locator('.sample-card').filter({ hasText: 'small.nex' });
	if (await nexCard.count() > 0) {
		await nexCard.click();
	} else {
		await page.locator('.sample-card').filter({ hasText: 'CD2-slim.fna' }).click();
	}
	await page.waitForTimeout(5000);

	// Scroll to tree
	await smoothScroll(page, 500, 2000);
	await page.waitForTimeout(3000);

	await smoothScroll(page, 300, 1500);
	await page.waitForTimeout(2000);
});

// ---------- SCENE 5: METHOD SELECTION ----------

test('scene-05 — method selector and configuration', async ({ page }) => {
	await prepareScene(page, 'scene-05');

	const fileCard = page.locator('.sample-card').filter({ hasText: 'CD2-slim.fna' });
	await fileCard.click();
	await page.waitForTimeout(3500);

	// Navigate to Analyze
	await page.locator('button:has-text("Analyze")').first().click();
	await page.waitForTimeout(2000);

	// Scroll through the method list
	await smoothScroll(page, 300, 2000);
	await page.waitForTimeout(1500);
	await smoothScroll(page, -300, 1500);
	await page.waitForTimeout(1500);

	// Hover over method buttons/cards
	const methods = ['MEME', 'FUBAR', 'aBSREL', 'BUSTED'];
	for (const m of methods) {
		const el = page.locator(`text=${m}`).first();
		if (await el.count() > 0) {
			await smoothMoveTo(page, el);
			await page.waitForTimeout(600);
		}
	}

	await page.waitForTimeout(2000);
});

// ---------- SCENE 6: BRANCH SELECTOR ----------

test('scene-06 — branch annotation for aBSREL', async ({ page }) => {
	await prepareScene(page, 'scene-06');

	const fileCard = page.locator('.sample-card').filter({ hasText: 'CD2-slim.fna' });
	await fileCard.click();
	await page.waitForTimeout(3500);

	await page.locator('button:has-text("Analyze")').first().click();
	await page.waitForTimeout(2000);

	// Select aBSREL — use a more specific selector to avoid multiple matches
	const absrel = page.locator('button:has-text("aBSREL"), [role="option"]:has-text("aBSREL"), label:has-text("aBSREL")').first();
	if (await absrel.count() > 0) {
		await absrel.click({ timeout: 5000 }).catch(() => {});
		await page.waitForTimeout(2000);

		// Scroll to show branch selector
		await smoothScroll(page, 400, 1500);
		await page.waitForTimeout(3000);
	}
});

// ---------- SCENE 7: FULL ANALYSIS RUN ----------

test('scene-07 — run FEL end-to-end and view results', async ({ page }) => {
	test.setTimeout(300000); // 5 minutes for WASM

	await prepareScene(page, 'scene-07');

	// Load file
	const fileCard = page.locator('.sample-card').filter({ hasText: 'CD2-slim.fna' });
	await fileCard.click();
	await page.waitForTimeout(3500);

	// Go to Analyze
	await page.locator('button:has-text("Analyze")').first().click();
	await page.waitForTimeout(2000);

	// Click Run
	const runButton = page
		.locator('button:has-text("Run FEL"), button:has-text("Run Analysis"), button:has-text("Run")')
		.first();
	if (await runButton.count() > 0 && (await runButton.isEnabled())) {
		await runButton.click();
	}

	// Show the running state
	await page.waitForTimeout(5000);

	// Wait for completion
	for (let i = 0; i < 50; i++) {
		const completed = page.locator('.text-green-600, [class*="complete"], [class*="success"]');
		if (await completed.count() > 0) break;
		await page.waitForTimeout(3000);
	}

	await page.waitForTimeout(2000);

	// Navigate to Results
	await page.locator('button:has-text("Results")').first().click();
	await page.waitForTimeout(3000);

	// Scroll through results
	await smoothScroll(page, 400, 2000);
	await page.waitForTimeout(2000);

	await smoothScroll(page, 400, 2000);
	await page.waitForTimeout(2000);

	await smoothScroll(page, -800, 2000);
	await page.waitForTimeout(1500);
});

// ---------- SCENE 8: COMPARISON TABLE ----------

test('scene-08 — animated v2 vs v3 comparison table', async ({ page }) => {
	await page.setContent(`
		<html>
		<head>
			<style>
				body { background:#f8fafc; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; }
				table { border-collapse:collapse; font-size:17px; box-shadow:0 4px 24px rgba(0,0,0,0.08); border-radius:12px; overflow:hidden; background:white; }
				th { background:#1e293b; color:white; padding:16px 32px; text-align:left; font-weight:600; font-size:15px; text-transform:uppercase; letter-spacing:0.5px; }
				td { padding:14px 32px; border-bottom:1px solid #e2e8f0; line-height:1.5; }
				tr:last-child td { border-bottom:none; }
				tr:nth-child(even) td { background:#f8fafc; }
				td:first-child { font-weight:600; color:#334155; min-width:160px; }
				td:nth-child(2) { color:#64748b; min-width:240px; }
				td:nth-child(3) { color:#0f172a; min-width:280px; }
				h2 { text-align:center; color:#1e293b; margin-bottom:24px; font-size:24px; font-weight:600; }
				.container { padding:40px; }
				tbody tr { opacity:0; transform:translateY(12px); transition:opacity 0.5s ease, transform 0.5s ease; }
				tbody tr.visible { opacity:1; transform:translateY(0); }
			</style>
		</head>
		<body>
			<div class="container">
				<h2>Datamonkey 2 &rarr; Datamonkey 3</h2>
				<table>
					<thead><tr><th>Aspect</th><th>Datamonkey 2</th><th>Datamonkey 3</th></tr></thead>
					<tbody id="tbody">
						<tr><td>Execution</td><td>Server-side only</td><td>Client-side (WASM) or server-side</td></tr>
						<tr><td>Data handling</td><td>Uploaded to remote server</td><td>Remains local in browser mode</td></tr>
						<tr><td>Dependencies</td><td>Requires server availability</td><td>Functions offline after initial load</td></tr>
						<tr><td>Interface</td><td>Multi-page form sequence</td><td>Single-page three-tab layout</td></tr>
						<tr><td>Visualization</td><td>Static output tables</td><td>Interactive HyPhy-Eye integration</td></tr>
						<tr><td>Analysis history</td><td>Session / URL-based</td><td>Persistent local storage (IndexedDB)</td></tr>
						<tr><td>Export</td><td>Individual file downloads</td><td>Individual or batch ZIP export</td></tr>
						<tr><td>Methods</td><td>~12</td><td>16 (actively expanding)</td></tr>
						<tr><td>Input validation</td><td>Post-submission</td><td>Pre-submission quality checks</td></tr>
					</tbody>
				</table>
			</div>
			<script>
				const rows = document.querySelectorAll('#tbody tr');
				rows.forEach((row, i) => {
					setTimeout(() => row.classList.add('visible'), 800 + i * 600);
				});
			</script>
		</body>
		</html>
	`);

	// Wait for all rows to animate in + hold
	await page.waitForTimeout(800 + 9 * 600 + 3000);
});

// ---------- SCENE 9: ARCHITECTURE DIAGRAM ----------

test('scene-09 — tech stack architecture diagram', async ({ page }) => {
	await page.setContent(`
		<html>
		<head>
			<style>
				body { background:#0f172a; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; font-family:'SF Mono','Fira Code','Cascadia Code',monospace; color:#e2e8f0; }
				.stack { display:flex; flex-direction:column; gap:16px; align-items:center; }
				.layer { background:#1e293b; border:1px solid #334155; border-radius:12px; padding:20px 48px; text-align:center; min-width:420px; opacity:0; transform:translateY(20px); transition:opacity 0.6s ease, transform 0.6s ease; }
				.layer.visible { opacity:1; transform:translateY(0); }
				.layer .label { font-size:13px; color:#64748b; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px; }
				.layer .tech { font-size:20px; font-weight:600; color:#f1f5f9; }
				.layer .detail { font-size:13px; color:#94a3b8; margin-top:4px; }
				.connector { width:2px; height:12px; background:#334155; opacity:0; transition:opacity 0.4s ease; }
				.connector.visible { opacity:1; }
				.dual { display:flex; gap:24px; }
				.dual .layer { min-width:200px; }
				h2 { color:#f1f5f9; font-size:14px; text-transform:uppercase; letter-spacing:2px; margin-bottom:32px; font-weight:400; opacity:0; transition:opacity 0.6s ease; }
				h2.visible { opacity:1; }
			</style>
		</head>
		<body>
			<div class="stack">
				<h2 id="title">Datamonkey 3 &mdash; Architecture</h2>
				<div class="layer" id="l1"><div class="label">Frontend</div><div class="tech">SvelteKit</div><div class="detail">Single-page application &bull; Three-tab workflow</div></div>
				<div class="connector" id="c1"></div>
				<div class="dual">
					<div class="layer" id="l2a"><div class="label">Local Execution</div><div class="tech">HyPhy &rarr; WASM</div><div class="detail">via Aioli framework</div></div>
					<div class="layer" id="l2b"><div class="label">Server Execution</div><div class="tech">SLURM Cluster</div><div class="detail">via Socket.IO</div></div>
				</div>
				<div class="connector" id="c2"></div>
				<div class="layer" id="l3"><div class="label">Visualization</div><div class="tech">HyPhy-Eye</div><div class="detail">Interactive result exploration</div></div>
				<div class="connector" id="c3"></div>
				<div class="layer" id="l4"><div class="label">Deployment</div><div class="tech">Cloudflare Edge</div><div class="detail">Global CDN &bull; Open source</div></div>
			</div>
			<script>
				const steps = [
					['title',500],['l1',1000],['c1',1500],['l2a',2000],['l2b',2300],
					['c2',2800],['l3',3300],['c3',3800],['l4',4300]
				];
				steps.forEach(([id, delay]) => {
					setTimeout(() => document.getElementById(id).classList.add('visible'), delay);
				});
			</script>
		</body>
		</html>
	`);

	await page.waitForTimeout(4300 + 3000);
});

// ---------- SCENE 10: CLOSING ----------

test('scene-10 — closing landing page hold', async ({ page }) => {
	await prepareScene(page, 'scene-10');

	await page.waitForTimeout(4000);

	await smoothScroll(page, 200, 2000);
	await page.waitForTimeout(1000);
	await smoothScroll(page, -200, 2000);
	await page.waitForTimeout(3000);
});

// ---------- LOGO-DRIVEN SCENES ----------

// Load SVG logo files so we can inline them in setContent HTML.
const LOGO_DIR = path.resolve('video-frames/logos');
function svg(name) {
	return fs.readFileSync(path.join(LOGO_DIR, name), 'utf-8');
}
function dataUrl(name) {
	const buf = fs.readFileSync(path.join(LOGO_DIR, name));
	const ext = path.extname(name).slice(1);
	return `data:image/${ext};base64,${buf.toString('base64')}`;
}

// ---------- SCENE 11: TECH STACK WITH REAL LOGOS ----------

test('scene-11 — animated tech stack with logos', async ({ page }) => {
	const hyphy = svg('hyphy.svg');
	const wasm = svg('webassembly.svg');
	const svelte = svg('svelte-horizontal.svg');
	const socketio = svg('socketio.svg');
	const mcp = svg('mcp-logo.svg');

	/*
	 * Topology (what the diagram must show):
	 *
	 *   [SvelteKit (browser UI)]           [MCP Clients]
	 *         |         \                       |
	 *         |          \                      |
	 *         v           v                     v
	 *      [WebAssembly]  [Socket.IO]  <--------+
	 *           \             /
	 *            \           /
	 *             v         v
	 *             [ HyPhy ]
	 *
	 * - SvelteKit UI can call WASM (local) OR Socket.IO (remote)
	 * - MCP clients only reach the system via Socket.IO
	 * - Both WASM and Socket.IO drive HyPhy as the analysis engine
	 */

	await page.setContent(`
		<html>
		<head>
			<style>
				* { box-sizing: border-box; }
				body { margin:0; background:#0f172a; color:#e2e8f0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:28px; }
				h2 { color:#cbd5e1; font-size:14px; text-transform:uppercase; letter-spacing:3px; margin:0; font-weight:400; opacity:0; transition:opacity 0.6s ease; }
				h2.visible { opacity:1; }

				.diagram { position:relative; width:1100px; height:620px; }

				.node {
					position:absolute; background:#f8fafc; border:1px solid #e2e8f0;
					border-radius:14px; padding:20px 28px; display:flex; flex-direction:column;
					align-items:center; gap:10px; opacity:0; transform:translateY(12px);
					transition:opacity 0.7s ease, transform 0.7s ease;
					box-shadow:0 8px 28px rgba(0,0,0,0.35);
				}
				.node.visible { opacity:1; transform:translateY(0); }
				.node .label { font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:1.5px; }
				.node .logo { height:48px; display:flex; align-items:center; justify-content:center; }
				.node .logo svg { height:48px; width:auto; max-width:200px; display:block; }
				.node .logo.wide svg { height:36px; max-width:300px; }
				.node .logo.recolor svg * { fill:#0f172a !important; }
				.node .name { font-size:15px; font-weight:600; color:#0f172a; }

				/* Node positions */
				#svelte   { top:0;   left:60px;  min-width:300px; }
				#mcp      { top:0;   right:60px; min-width:320px; }
				#wasm     { top:240px; left:60px;  min-width:300px; }
				#socket   { top:240px; right:60px; min-width:300px; }
				#hyphy    { bottom:0; left:50%; transform:translate(-50%, 12px); min-width:260px; }
				#hyphy.visible { transform:translate(-50%, 0); }

				/* Line overlay (SVG) sits above the background but behind the nodes */
				svg.lines { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
				svg.lines line, svg.lines path {
					stroke:#94a3b8; stroke-width:2.5; fill:none;
					stroke-dasharray:1 0;
					opacity:0; transition:opacity 0.6s ease;
				}
				svg.lines .visible { opacity:0.9; }
			</style>
		</head>
		<body>
			<h2 id="title">Datamonkey 3 &mdash; Under the Hood</h2>

			<div class="diagram">
				<!-- SVG connector overlay. viewBox matches the container's pixel size. -->
				<svg class="lines" viewBox="0 0 1100 620" preserveAspectRatio="none">
					<!-- SvelteKit -> WASM (straight down on left side) -->
					<path id="line-svelte-wasm" d="M 210 110 L 210 240" />
					<!-- SvelteKit -> Socket.IO (diagonal to the right) -->
					<path id="line-svelte-socket" d="M 300 110 C 500 110, 600 240, 890 240" />
					<!-- MCP -> Socket.IO (straight down on right side) -->
					<path id="line-mcp-socket" d="M 890 110 L 890 240" />
					<!-- WASM -> HyPhy (diagonal to center) -->
					<path id="line-wasm-hyphy" d="M 210 360 C 210 500, 420 520, 550 560" />
					<!-- Socket.IO -> HyPhy (diagonal to center) -->
					<path id="line-socket-hyphy" d="M 890 360 C 890 500, 680 520, 550 560" />
				</svg>

				<div class="node" id="svelte">
					<div class="label">Browser UI</div>
					<div class="logo">${svelte}</div>
					<div class="name">SvelteKit</div>
				</div>

				<div class="node" id="mcp">
					<div class="label">Agent Access</div>
					<div class="logo wide">${mcp}</div>
					<div class="name">Any MCP-aware client</div>
				</div>

				<div class="node" id="wasm">
					<div class="label">Local Runtime</div>
					<div class="logo">${wasm}</div>
					<div class="name">WebAssembly &middot; Aioli</div>
				</div>

				<div class="node" id="socket">
					<div class="label">Remote Runtime</div>
					<div class="logo">${socketio}</div>
					<div class="name">Socket.IO &middot; SLURM</div>
				</div>

				<div class="node" id="hyphy">
					<div class="label">Analysis Engine</div>
					<div class="logo recolor">${hyphy}</div>
					<div class="name">HyPhy</div>
				</div>
			</div>

			<script>
				// Animation order follows the story:
				//   1. Title
				//   2. HyPhy (the foundation)
				//   3. Execution transports + lines down to HyPhy
				//   4. Entry points + lines into transports
				const steps = [
					['title', 300],
					['hyphy', 900],
					['wasm', 1500],
					['line-wasm-hyphy', 1700],
					['socket', 2100],
					['line-socket-hyphy', 2300],
					['svelte', 2900],
					['line-svelte-wasm', 3100],
					['line-svelte-socket', 3300],
					['mcp', 3900],
					['line-mcp-socket', 4100]
				];
				steps.forEach(([id, d]) => setTimeout(() => {
					const el = document.getElementById(id);
					if (el) el.classList.add('visible');
				}, d));
			</script>
		</body>
		</html>
	`);

	await page.waitForTimeout(4700 + 3500);
});

// ---------- SCENE 12: DUAL EXECUTION MODEL DIAGRAM ----------

test('scene-12 — dual execution model (browser vs cluster)', async ({ page }) => {
	const wasm = svg('webassembly.svg');
	const socketio = svg('socketio.svg');

	await page.setContent(`
		<html>
		<head>
			<style>
				* { box-sizing: border-box; }
				body { margin:0; background:#f8fafc; color:#0f172a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:48px; }
				h1 { font-size:15px; font-weight:600; text-transform:uppercase; letter-spacing:2px; color:#475569; margin:0; opacity:0; transition:opacity 0.6s ease; }
				h1.visible { opacity:1; }
				.layout { display:flex; align-items:center; gap:64px; }
				.side { display:flex; flex-direction:column; align-items:center; gap:18px; padding:40px 56px; background:white; border-radius:20px; box-shadow:0 6px 32px rgba(15,23,42,0.08); border:1px solid #e2e8f0; min-width:360px; opacity:0; transform:scale(0.92); transition:opacity 0.7s ease, transform 0.7s ease; }
				.side.visible { opacity:1; transform:scale(1); }
				.side .logo { height:72px; display:flex; align-items:center; justify-content:center; }
				.side .logo svg { height:72px; width:auto; max-width:240px; display:block; }
				.side .title { font-size:20px; font-weight:700; color:#0f172a; }
				.side .sub { font-size:14px; color:#64748b; text-align:center; line-height:1.5; max-width:280px; }
				.side.local .title { color:#6930c3; }
				.side.remote .title { color:#0369a1; }
				.divider { display:flex; flex-direction:column; align-items:center; gap:12px; opacity:0; transition:opacity 0.6s ease; }
				.divider.visible { opacity:1; }
				.divider .or { font-size:13px; font-weight:700; color:#94a3b8; letter-spacing:2px; padding:10px 18px; border:2px solid #cbd5e1; border-radius:999px; background:white; }
				.caption { font-size:15px; color:#334155; max-width:640px; text-align:center; line-height:1.6; opacity:0; transition:opacity 0.6s ease; }
				.caption.visible { opacity:1; }
				.pill { display:inline-flex; align-items:center; gap:6px; padding:4px 12px; background:#f1f5f9; border-radius:999px; font-size:12px; font-weight:600; color:#475569; margin-top:4px; }
				.pill.stay { background:#ede9fe; color:#6930c3; }
				.pill.send { background:#e0f2fe; color:#0369a1; }
			</style>
		</head>
		<body>
			<h1 id="title">Dual Execution Model</h1>
			<div class="layout">
				<div class="side local" id="left">
					<div class="logo">${wasm}</div>
					<div class="title">Local</div>
					<div class="sub">HyPhy compiled to WebAssembly, running in your browser.</div>
					<div class="pill stay">Data stays on your machine</div>
				</div>
				<div class="divider" id="divider">
					<div class="or">OR</div>
				</div>
				<div class="side remote" id="right">
					<div class="logo">${socketio}</div>
					<div class="title">Remote</div>
					<div class="sub">Large jobs stream to a SLURM-managed compute cluster.</div>
					<div class="pill send">Data sent over Socket.IO</div>
				</div>
			</div>
			<div class="caption" id="caption">One toggle. The interface does not change &mdash; only the location of the computation.</div>
			<script>
				const steps = [
					['title', 300],
					['left', 900],
					['divider', 1500],
					['right', 1900],
					['caption', 2800]
				];
				steps.forEach(([id, d]) => setTimeout(() => document.getElementById(id).classList.add('visible'), d));
			</script>
		</body>
		</html>
	`);

	await page.waitForTimeout(3200 + 4000);
});

// ---------- SCENE 13: DATAMONKEY 2 → 3 TRANSITION ----------

test('scene-13 — datamonkey 2 to 3 transition', async ({ page }) => {
	const dm = svg('datamonkey.svg');

	await page.setContent(`
		<html>
		<head>
			<style>
				* { box-sizing: border-box; }
				body { margin:0; background:#fafaf9; color:#0f172a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; height:100vh; display:flex; align-items:center; justify-content:center; }
				.wrap { display:flex; align-items:center; gap:64px; }
				.slot { display:flex; flex-direction:column; align-items:center; gap:20px; padding:48px 64px; border-radius:24px; background:white; border:1px solid #e7e5e4; box-shadow:0 8px 40px rgba(15,23,42,0.08); min-width:380px; opacity:0; transform:translateY(16px); transition:opacity 0.8s ease, transform 0.8s ease; }
				.slot.visible { opacity:1; transform:translateY(0); }
				.slot .logo { height:90px; display:flex; align-items:center; justify-content:center; }
				.slot .logo svg { height:90px; width:auto; max-width:320px; display:block; }
				/* Datamonkey logo has white fills — recolor for light background */
				.slot.v2 .logo svg * { fill:#78716c !important; }
				.slot.v3 .logo svg * { fill:#7c3aed !important; }
				.slot .v { font-size:42px; font-weight:800; letter-spacing:-1px; }
				.slot.v2 .v { color:#a8a29e; }
				.slot.v3 .v { background:linear-gradient(135deg,#7c3aed,#db2777); -webkit-background-clip:text; background-clip:text; color:transparent; }
				.slot .tag { font-size:13px; color:#78716c; text-transform:uppercase; letter-spacing:2px; }
				.arrow { opacity:0; transition:opacity 0.6s ease; font-size:48px; color:#a8a29e; }
				.arrow.visible { opacity:1; }
			</style>
		</head>
		<body>
			<div class="wrap">
				<div class="slot v2" id="v2">
					<div class="logo">${dm}</div>
					<div class="v">2</div>
					<div class="tag">Since 2005</div>
				</div>
				<div class="arrow" id="arrow">&rarr;</div>
				<div class="slot v3" id="v3">
					<div class="logo">${dm}</div>
					<div class="v">3</div>
					<div class="tag">Reimagined</div>
				</div>
			</div>
			<script>
				setTimeout(() => document.getElementById('v2').classList.add('visible'), 500);
				setTimeout(() => document.getElementById('arrow').classList.add('visible'), 1600);
				setTimeout(() => document.getElementById('v3').classList.add('visible'), 2200);
			</script>
		</body>
		</html>
	`);

	await page.waitForTimeout(3200 + 3500);
});

// ---------- SCENE 14: MCP + BROWSER ACCESS MODES ----------

test('scene-14 — access modes: browser and MCP', async ({ page }) => {
	const mcp = svg('mcp-logo.svg');

	await page.setContent(`
		<html>
		<head>
			<style>
				* { box-sizing: border-box; }
				body { margin:0; background:#0f172a; color:#e2e8f0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; height:100vh; display:flex; align-items:center; justify-content:center; }
				.container { display:flex; flex-direction:column; align-items:center; gap:48px; }
				h1 { font-size:14px; font-weight:600; text-transform:uppercase; letter-spacing:3px; color:#94a3b8; margin:0; opacity:0; transition:opacity 0.6s ease; }
				h1.visible { opacity:1; }
				.modes { display:flex; gap:32px; }
				.mode { background:#1e293b; border:1px solid #334155; border-radius:16px; padding:32px 40px; display:flex; flex-direction:column; align-items:center; gap:16px; min-width:240px; opacity:0; transform:translateY(20px); transition:opacity 0.7s ease, transform 0.7s ease; }
				.mode.visible { opacity:1; transform:translateY(0); }
				.mode .glyph { min-width:72px; height:72px; display:flex; align-items:center; justify-content:center; font-size:56px; color:#cbd5e1; }
				.mode.light { background:#f8fafc; color:#0f172a; }
				.mode .label { font-size:12px; color:#64748b; text-transform:uppercase; letter-spacing:1.5px; }
				.mode.light .label { color:#475569; }
				.mode .name { font-size:20px; font-weight:700; color:#f1f5f9; }
				.mode.light .name { color:#0f172a; }
				.mode .sub { font-size:13px; color:#94a3b8; text-align:center; max-width:260px; line-height:1.5; }
				.mode.light .sub { color:#64748b; }
				.mode .glyph svg { height:56px; width:auto; max-width:420px; display:block; }
				.mode .glyph img { height:56px; width:auto; display:block; }
				.mode.wide { min-width:440px; }
				.arrow-down { font-size:24px; color:#475569; opacity:0; transition:opacity 0.6s ease; }
				.arrow-down.visible { opacity:1; }
				.target { padding:20px 40px; background:linear-gradient(135deg,#7c3aed,#db2777); border-radius:14px; font-size:20px; font-weight:700; color:white; letter-spacing:0.5px; opacity:0; transform:scale(0.92); transition:opacity 0.7s ease, transform 0.7s ease; }
				.target.visible { opacity:1; transform:scale(1); }
			</style>
		</head>
		<body>
			<div class="container">
				<h1 id="title">How to reach Datamonkey 3</h1>
				<div class="modes">
					<div class="mode" id="m1">
						<div class="glyph">&#x1F310;</div>
						<div class="label">Interactive</div>
						<div class="name">Browser</div>
						<div class="sub">The three-tab web interface at v3.datamonkey.org</div>
					</div>
					<div class="mode light wide" id="m2">
						<div class="label">Programmatic</div>
						<div class="glyph">${mcp}</div>
						<div class="sub">Any MCP-aware client &mdash; Claude, Cursor, your own agent</div>
					</div>
				</div>
				<div class="arrow-down" id="arrow">&darr;</div>
				<div class="target" id="target">Datamonkey 3</div>
			</div>
			<script>
				const steps = [
					['title', 400],
					['m1', 900],
					['m2', 1400],
					['arrow', 2200],
					['target', 2600]
				];
				steps.forEach(([id, d]) => setTimeout(() => document.getElementById(id).classList.add('visible'), d));
			</script>
		</body>
		</html>
	`);

	await page.waitForTimeout(3200 + 3500);
});

// ---------- ACT 1 INTRO SCENES ----------

// ---------- SCENE A1: MILLION-JOB COUNTER ----------

test('scene-a1 — million job counter', async ({ page }) => {
	await page.setContent(`
		<html>
		<head>
			<style>
				* { box-sizing: border-box; }
				body { margin:0; background:#0a0e16; color:#e2e8f0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:24px; }
				.counter { font-family:'SF Mono','Fira Code','Courier New',monospace; font-size:140px; font-weight:700; letter-spacing:-2px; color:#f8fafc; font-variant-numeric:tabular-nums; opacity:0; transition:opacity 0.8s ease; }
				.counter.visible { opacity:1; }
				.sub { font-size:16px; color:#64748b; letter-spacing:3px; text-transform:uppercase; opacity:0; transition:opacity 0.8s ease; }
				.sub.visible { opacity:1; }
				.plus { color:#7c3aed; }
			</style>
		</head>
		<body>
			<div class="counter" id="counter">0</div>
			<div class="sub" id="sub">jobs processed since 2005</div>
			<script>
				const el = document.getElementById('counter');
				const sub = document.getElementById('sub');
				const target = 1245000;
				const duration = 5500;
				const start = performance.now();

				setTimeout(() => el.classList.add('visible'), 300);
				setTimeout(() => sub.classList.add('visible'), 900);

				function tick(now) {
					const t = Math.min((now - start - 300) / duration, 1);
					if (t < 0) { requestAnimationFrame(tick); return; }
					const eased = 1 - Math.pow(1 - t, 3);
					const value = Math.floor(target * eased);
					el.textContent = value.toLocaleString();
					if (t < 1) requestAnimationFrame(tick);
					else el.innerHTML = value.toLocaleString() + '<span class="plus">+</span>';
				}
				requestAnimationFrame(tick);
			</script>
		</body>
		</html>
	`);

	await page.waitForTimeout(300 + 5500 + 2500);
});

// ---------- SCENE A2: FOUR-PHYLOGENY SLIDESHOW ----------

test('scene-a2 — four phylogenies slideshow', async ({ page }) => {
	// Hand-drawn schematic phylogenies. Each tree has a characteristic topology
	// that visually suggests the study's biological reality:
	//   - HIV: bushy, many short branches (within-host diversity)
	//   - Flu: ladder-like (seasonal antigenic drift)
	//   - SARS-CoV-2: starburst (rapid early expansion from one source)
	//   - Insect chemoreceptors: balanced cladogram (ancient duplication)
	// Trees are generated in the page's JS so the positions are deterministic
	// per page load but visually varied.

	await page.setContent(`
		<html>
		<head>
			<style>
				* { box-sizing: border-box; }
				body { margin:0; background:#0a0e16; color:#e2e8f0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; height:100vh; display:flex; align-items:center; justify-content:center; position:relative; overflow:hidden; }
				.slide { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; gap:80px; padding:0 120px; opacity:0; transition:opacity 1s ease; }
				.slide.visible { opacity:1; }
				.tree-container { width:480px; height:480px; display:flex; align-items:center; justify-content:center; }
				.tree-container svg { width:100%; height:100%; }
				.tree-container svg line, .tree-container svg path.branch { stroke:#cbd5e1; stroke-width:1.5; fill:none; stroke-linecap:round; }
				.tree-container svg circle.tip { fill:#f8fafc; }
				.tree-container svg circle.root { fill:#7c3aed; }
				.caption { max-width:420px; }
				.caption .method { font-size:14px; letter-spacing:3px; text-transform:uppercase; color:#7c3aed; font-weight:600; margin-bottom:16px; }
				.caption .title { font-size:28px; font-weight:600; color:#f8fafc; line-height:1.3; margin-bottom:14px; letter-spacing:-0.5px; }
				.caption .year { font-size:13px; color:#64748b; letter-spacing:2px; text-transform:uppercase; margin-bottom:18px; }
				.caption .note { font-size:15px; color:#94a3b8; line-height:1.6; }
			</style>
		</head>
		<body>
			<div class="slide" id="s1">
				<div class="tree-container"><svg viewBox="0 0 400 400" id="tree1"></svg></div>
				<div class="caption">
					<div class="method">MEME</div>
					<div class="title">Episodic selection in HIV-1 env</div>
					<div class="year">Durban &middot; 2009</div>
					<div class="note">Detecting site-specific adaptive bursts across a heterogeneous viral population.</div>
				</div>
			</div>

			<div class="slide" id="s2">
				<div class="tree-container"><svg viewBox="0 0 400 400" id="tree2"></svg></div>
				<div class="caption">
					<div class="method">FUBAR</div>
					<div class="title">Antigenic drift in influenza H3N2</div>
					<div class="year">Global surveillance &middot; 1968&ndash;2020</div>
					<div class="note">Pervasive purifying selection punctuated by seasonal epitope shifts across half a century.</div>
				</div>
			</div>

			<div class="slide" id="s3">
				<div class="tree-container"><svg viewBox="0 0 400 400" id="tree3"></svg></div>
				<div class="caption">
					<div class="method">SLAC &middot; FEL</div>
					<div class="title">First selection scans on SARS-CoV-2</div>
					<div class="year">Wuhan &rarr; global &middot; early 2020</div>
					<div class="note">Run on the earliest published genomes &mdash; while the world was still learning the virus's name.</div>
				</div>
			</div>

			<div class="slide" id="s4">
				<div class="tree-container"><svg viewBox="0 0 400 400" id="tree4"></svg></div>
				<div class="caption">
					<div class="method">aBSREL</div>
					<div class="title">Insect chemoreceptor evolution</div>
					<div class="year">Hymenoptera &middot; ongoing</div>
					<div class="note">Branch-site tests on receptor families that whisper about the origins of social life.</div>
				</div>
			</div>

			<script>
				// Deterministic pseudo-random for reproducible trees
				function makeRng(seed) {
					let s = seed;
					return () => {
						s = (s * 1103515245 + 12345) & 0x7fffffff;
						return s / 0x7fffffff;
					};
				}
				function el(tag, attrs) {
					const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
					for (const k in attrs) e.setAttribute(k, attrs[k]);
					return e;
				}

				// Tree 1: HIV — bushy radial
				(() => {
					const svg = document.getElementById('tree1');
					const rng = makeRng(42);
					const g = el('g', { transform: 'translate(200,200)' });
					svg.appendChild(g);
					for (let i = 0; i < 32; i++) {
						const angle = (i / 32) * Math.PI * 2 + (rng() - 0.5) * 0.1;
						const l1 = 55 + rng() * 25;
						const l2 = l1 + 35 + rng() * 45;
						const l3 = l2 + 20 + rng() * 30;
						const p = (r) => [Math.cos(angle) * r, Math.sin(angle) * r];
						const [x1,y1] = p(l1), [x2,y2] = p(l2), [x3,y3] = p(l3);
						g.appendChild(el('line', { x1:0, y1:0, x2:x1, y2:y1 }));
						g.appendChild(el('line', { x1:x1, y1:y1, x2:x2, y2:y2 }));
						g.appendChild(el('line', { x1:x2, y1:y2, x2:x3, y2:y3 }));
						g.appendChild(el('circle', { class:'tip', cx:x3, cy:y3, r:2.5 }));
					}
					g.appendChild(el('circle', { class:'root', cx:0, cy:0, r:4.5 }));
				})();

				// Tree 2: Influenza — ladder with branches fanning up
				(() => {
					const svg = document.getElementById('tree2');
					const rng = makeRng(97);
					const startX = 50, endX = 370, trunkY = 280;
					svg.appendChild(el('line', { x1:startX, y1:trunkY, x2:endX, y2:trunkY }));
					for (let i = 0; i < 20; i++) {
						const x = startX + (endX - startX) * ((i + 0.5) / 20);
						const branchLen = 45 + rng() * 110;
						const tipX = x + (rng() - 0.5) * 20;
						const tipY = trunkY - branchLen;
						svg.appendChild(el('line', { x1:x, y1:trunkY, x2:tipX, y2:tipY }));
						for (let j = 0; j < 2; j++) {
							const subY = trunkY - branchLen * (0.5 + j * 0.3);
							const subTipX = tipX + (rng() - 0.5) * 28;
							const subTipY = subY - 14 - rng() * 20;
							svg.appendChild(el('line', { x1:tipX, y1:subY, x2:subTipX, y2:subTipY }));
							svg.appendChild(el('circle', { class:'tip', cx:subTipX, cy:subTipY, r:2.3 }));
						}
						svg.appendChild(el('circle', { class:'tip', cx:tipX, cy:tipY, r:2.5 }));
					}
					svg.appendChild(el('circle', { class:'root', cx:startX, cy:trunkY, r:4.5 }));
				})();

				// Tree 3: SARS-CoV-2 — long radial starburst
				(() => {
					const svg = document.getElementById('tree3');
					const rng = makeRng(31);
					const g = el('g', { transform: 'translate(200,200)' });
					svg.appendChild(g);
					for (let i = 0; i < 24; i++) {
						const angle = (i / 24) * Math.PI * 2 + (rng() - 0.5) * 0.12;
						const len = 120 + rng() * 50;
						const x = Math.cos(angle) * len;
						const y = Math.sin(angle) * len;
						g.appendChild(el('line', { x1:0, y1:0, x2:x, y2:y }));
						for (let j = 0; j < 2; j++) {
							const midR = len * (0.72 + j * 0.12);
							const mx = Math.cos(angle) * midR;
							const my = Math.sin(angle) * midR;
							const perp = angle + Math.PI / 2;
							const side = j === 0 ? 1 : -1;
							const sub = 10 + rng() * 12;
							const sx = mx + Math.cos(perp) * sub * side;
							const sy = my + Math.sin(perp) * sub * side;
							g.appendChild(el('line', { x1:mx, y1:my, x2:sx, y2:sy }));
							g.appendChild(el('circle', { class:'tip', cx:sx, cy:sy, r:2 }));
						}
						g.appendChild(el('circle', { class:'tip', cx:x, cy:y, r:2.5 }));
					}
					g.appendChild(el('circle', { class:'root', cx:0, cy:0, r:5 }));
				})();

				// Tree 4: Insect chemoreceptors — balanced cladogram
				(() => {
					const svg = document.getElementById('tree4');
					function branch(x1, y1, x2, y2, depth) {
						svg.appendChild(el('line', { x1, y1, x2, y2 }));
						if (depth === 0) {
							svg.appendChild(el('circle', { class:'tip', cx:x2, cy:y2, r:2.5 }));
							return;
						}
						const span = 70 / Math.pow(1.75, 4 - depth);
						const nx1 = x2 - span;
						const nx2 = x2 + span;
						const ny = y2 + 60;
						svg.appendChild(el('line', { x1:x2, y1:y2, x2:nx1, y2:y2 }));
						svg.appendChild(el('line', { x1:x2, y1:y2, x2:nx2, y2:y2 }));
						branch(nx1, y2, nx1, ny, depth - 1);
						branch(nx2, y2, nx2, ny, depth - 1);
					}
					branch(200, 20, 200, 60, 4);
					svg.appendChild(el('circle', { class:'root', cx:200, cy:20, r:5 }));
				})();

				// Slide timing: 4 slides, each held ~4.2s with 0.5s crossfade overlap
				const slides = ['s1', 's2', 's3', 's4'];
				const hold = 4200;
				const fadeOverlap = 500;
				slides.forEach((id, i) => {
					setTimeout(() => document.getElementById(id).classList.add('visible'), 400 + i * (hold - fadeOverlap));
					if (i < slides.length - 1) {
						setTimeout(() => document.getElementById(id).classList.remove('visible'), 400 + (i + 1) * (hold - fadeOverlap));
					}
				});
			</script>
		</body>
		</html>
	`);

	// 400 start + 4 slides * 3700ms step + final hold
	await page.waitForTimeout(400 + 4 * 3700 + 1500);
});

// ---------- SCENE A3: DATA-STAYS-HERE DIAGRAM ----------

test('scene-a3 — data stays here', async ({ page }) => {
	const wasm = svg('webassembly.svg');

	await page.setContent(`
		<html>
		<head>
			<style>
				* { box-sizing: border-box; }
				body { margin:0; background:#0a0e16; color:#e2e8f0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:56px; }
				h2 { font-size:14px; letter-spacing:3px; text-transform:uppercase; color:#64748b; margin:0; opacity:0; transition:opacity 0.6s ease; font-weight:400; }
				h2.visible { opacity:1; }
				.panels { display:flex; gap:64px; align-items:stretch; }
				.panel { background:#1e293b; border:1px solid #334155; border-radius:18px; padding:40px 48px; display:flex; flex-direction:column; align-items:center; gap:20px; min-width:440px; min-height:360px; opacity:0; transform:translateY(20px); transition:opacity 0.8s ease, transform 0.8s ease; }
				.panel.visible { opacity:1; transform:translateY(0); }
				.panel.before { border-color:rgba(239,68,68,0.4); }
				.panel.after { border-color:rgba(34,197,94,0.4); }
				.panel .stamp { font-size:12px; letter-spacing:2px; text-transform:uppercase; font-weight:600; padding:5px 14px; border-radius:999px; }
				.panel.before .stamp { background:rgba(239,68,68,0.12); color:#fca5a5; }
				.panel.after .stamp { background:rgba(34,197,94,0.12); color:#86efac; }
				.flow { display:flex; align-items:center; gap:20px; margin:20px 0 10px; }
				.glyph { width:80px; height:80px; display:flex; align-items:center; justify-content:center; font-size:48px; border-radius:16px; background:#0f172a; border:1px solid #334155; }
				.glyph.file { font-size:40px; }
				.glyph.cloud { font-size:44px; color:#94a3b8; }
				.glyph.wasm { padding:12px; }
				.glyph.wasm svg { height:56px; width:auto; }
				.arrow { font-size:36px; color:#475569; }
				.arrow.red { color:#ef4444; }
				.arrow.green { color:#22c55e; }
				.caption { text-align:center; max-width:360px; line-height:1.5; }
				.caption .big { font-size:22px; font-weight:600; margin-bottom:8px; letter-spacing:-0.3px; }
				.panel.before .big { color:#fca5a5; }
				.panel.after .big { color:#86efac; }
				.caption .small { font-size:14px; color:#94a3b8; }
				.subtitle { font-size:16px; color:#cbd5e1; max-width:720px; text-align:center; line-height:1.6; opacity:0; transition:opacity 0.6s ease; }
				.subtitle.visible { opacity:1; }
			</style>
		</head>
		<body>
			<h2 id="title">Where does your data go?</h2>

			<div class="panels">
				<div class="panel before" id="p1">
					<div class="stamp">Datamonkey 2</div>
					<div class="flow">
						<div class="glyph file">&#x1F4C4;</div>
						<div class="arrow red">&rarr;</div>
						<div class="glyph cloud">&#x2601;&#xFE0F;</div>
					</div>
					<div class="caption">
						<div class="big">Uploaded</div>
						<div class="small">Alignments leave your institution, traverse the network, and sit on someone else's disk.</div>
					</div>
				</div>

				<div class="panel after" id="p2">
					<div class="stamp">Datamonkey 3</div>
					<div class="flow">
						<div class="glyph file">&#x1F4C4;</div>
						<div class="arrow green">&rarr;</div>
						<div class="glyph wasm">${wasm}</div>
					</div>
					<div class="caption">
						<div class="big">Stays here</div>
						<div class="small">HyPhy runs in your browser via WebAssembly. The file never crosses the network.</div>
					</div>
				</div>
			</div>

			<div class="subtitle" id="sub">Your data is your data.</div>

			<script>
				const steps = [
					['title', 300],
					['p1', 900],
					['p2', 1700],
					['sub', 2800]
				];
				steps.forEach(([id, d]) => setTimeout(() => document.getElementById(id).classList.add('visible'), d));
			</script>
		</body>
		</html>
	`);

	await page.waitForTimeout(3400 + 3500);
});

// ---------- SCENE A4: THREE-PATH FAN-OUT (REVEAL) ----------

test('scene-a4 — three-path fan-out reveal', async ({ page }) => {
	const socketio = svg('socketio.svg');
	const mcp = svg('mcp-logo.svg');

	await page.setContent(`
		<html>
		<head>
			<style>
				* { box-sizing: border-box; }
				body { margin:0; background:#0a0e16; color:#e2e8f0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:28px; position:relative; }
				h2 { font-size:14px; letter-spacing:3px; text-transform:uppercase; color:#64748b; margin:0; opacity:0; transition:opacity 0.6s ease; font-weight:400; }
				h2.visible { opacity:1; }

				.diagram { position:relative; width:1100px; height:520px; }

				.hub {
					position:absolute; top:40%; left:50%; transform:translate(-50%, -50%) scale(0.9);
					padding:28px 56px; background:linear-gradient(135deg,#7c3aed,#db2777);
					border-radius:20px; box-shadow:0 10px 48px rgba(124,58,237,0.35);
					opacity:0; transition:opacity 0.9s ease, transform 0.9s ease;
					text-align:center;
				}
				.hub.visible { opacity:1; transform:translate(-50%, -50%) scale(1); }
				.hub .mark { font-size:11px; letter-spacing:3px; text-transform:uppercase; color:rgba(255,255,255,0.75); margin-bottom:6px; }
				.hub .name { font-size:36px; font-weight:700; color:white; letter-spacing:-0.5px; }

				.spoke {
					position:absolute;
					background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px;
					padding:20px 28px; min-width:220px;
					display:flex; flex-direction:column; align-items:center; gap:10px;
					opacity:0; transform:scale(0.9);
					transition:opacity 0.8s ease, transform 0.8s ease;
					box-shadow:0 8px 32px rgba(0,0,0,0.35);
				}
				.spoke.visible { opacity:1; transform:scale(1); }
				.spoke .label { font-size:10px; letter-spacing:1.5px; text-transform:uppercase; color:#64748b; }
				.spoke .name { font-size:16px; font-weight:600; color:#0f172a; }
				.spoke .glyph { height:48px; display:flex; align-items:center; justify-content:center; }
				.spoke .glyph svg { height:48px; width:auto; max-width:220px; display:block; }
				.spoke .glyph.icon { font-size:44px; }
				.spoke .glyph.wide svg { height:36px; max-width:340px; }
				.spoke.mcp-card { min-width:380px; }

				#browser { top:40px; left:120px; }
				#cluster { top:40px; right:120px; }
				#mcp     { bottom:20px; left:50%; transform:translate(-50%, 0) scale(0.9); }
				#mcp.visible { transform:translate(-50%, 0) scale(1); }

				svg.lines { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
				svg.lines path { stroke:#475569; stroke-width:2.5; fill:none; stroke-linecap:round; opacity:0; transition:opacity 0.8s ease; }
				svg.lines path.visible { opacity:0.8; }
			</style>
		</head>
		<body>
			<h2 id="title">Three ways in</h2>

			<div class="diagram">
				<svg class="lines" viewBox="0 0 1100 520" preserveAspectRatio="none">
					<path id="line-browser" d="M 240 105 C 340 180, 430 230, 540 250" />
					<path id="line-cluster" d="M 860 105 C 760 180, 670 230, 560 250" />
					<path id="line-mcp" d="M 550 440 L 550 340" />
				</svg>

				<div class="hub" id="hub">
					<div class="name">Datamonkey 3</div>
				</div>

				<div class="spoke" id="browser">
					<div class="label">Interactive</div>
					<div class="glyph icon">&#x1F310;</div>
					<div class="name">Browser</div>
				</div>

				<div class="spoke" id="cluster">
					<div class="label">Heavy compute</div>
					<div class="glyph">${socketio}</div>
					<div class="name">Socket.IO &middot; SLURM</div>
				</div>

				<div class="spoke mcp-card" id="mcp">
					<div class="label">Agent-ready</div>
					<div class="glyph wide">${mcp}</div>
				</div>
			</div>

			<script>
				const steps = [
					['title', 300],
					['hub', 900],
					['browser', 1700],
					['line-browser', 1900],
					['cluster', 2400],
					['line-cluster', 2600],
					['mcp', 3100],
					['line-mcp', 3300]
				];
				steps.forEach(([id, d]) => setTimeout(() => {
					const el = document.getElementById(id);
					if (el) el.classList.add('visible');
				}, d));
			</script>
		</body>
		</html>
	`);

	await page.waitForTimeout(3500 + 3500);
});

// ---------- SCENE A4 HIGHLIGHT STILLS ----------
// Three static PNGs that reuse the scene-a4 layout, each one with a different
// spoke highlighted (others dimmed) and the connecting line emphasized.
// Saves directly to video-frames/scene-a4-highlight-{browser,cluster,mcp}.png.

test('scene-a4-highlights — three highlight stills', async ({ page }) => {
	const socketio = svg('socketio.svg');
	const mcp = svg('mcp-logo.svg');

	await page.setContent(`
		<html>
		<head>
			<style>
				* { box-sizing: border-box; }
				body { margin:0; background:#0a0e16; color:#e2e8f0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:28px; position:relative; }
				h2 { font-size:14px; letter-spacing:3px; text-transform:uppercase; color:#64748b; margin:0; font-weight:400; }

				.diagram { position:relative; width:1100px; height:520px; }

				.hub {
					position:absolute; top:40%; left:50%; transform:translate(-50%, -50%);
					padding:28px 56px; background:linear-gradient(135deg,#7c3aed,#db2777);
					border-radius:20px; box-shadow:0 10px 48px rgba(124,58,237,0.35);
					text-align:center; transition:opacity 0.3s ease;
				}
				.hub .name { font-size:36px; font-weight:700; color:white; letter-spacing:-0.5px; }

				.spoke {
					position:absolute;
					background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px;
					padding:20px 28px; min-width:220px;
					display:flex; flex-direction:column; align-items:center; gap:10px;
					box-shadow:0 8px 32px rgba(0,0,0,0.35);
					transition:opacity 0.3s ease, transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease;
				}
				.spoke .label { font-size:10px; letter-spacing:1.5px; text-transform:uppercase; color:#64748b; }
				.spoke .name { font-size:16px; font-weight:600; color:#0f172a; }
				.spoke .glyph { height:48px; display:flex; align-items:center; justify-content:center; }
				.spoke .glyph svg { height:48px; width:auto; max-width:220px; display:block; }
				.spoke .glyph.icon { font-size:44px; }
				.spoke .glyph.wide svg { height:36px; max-width:340px; }
				.spoke.mcp-card { min-width:380px; }

				/* Highlight / dim states */
				.spoke.dim { opacity:0.25; filter:saturate(0.4); }
				.spoke.bright {
					transform:scale(1.08);
					border-color:#7c3aed;
					box-shadow:0 0 0 3px rgba(124,58,237,0.25), 0 14px 40px rgba(124,58,237,0.35);
				}
				.spoke.bright .label { color:#7c3aed; }
				.hub.dim { opacity:0.5; }

				#browser { top:40px; left:120px; }
				#cluster { top:40px; right:120px; }
				#mcp     { bottom:20px; left:50%; transform:translate(-50%, 0); }
				#mcp.bright { transform:translate(-50%, 0) scale(1.08); }

				svg.lines { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
				svg.lines path { fill:none; stroke:#475569; stroke-width:2.5; stroke-linecap:round; opacity:0.25; transition:opacity 0.3s ease, stroke 0.3s ease, stroke-width 0.3s ease; }
				svg.lines path.bright { stroke:#7c3aed; stroke-width:4; opacity:1; filter:drop-shadow(0 0 6px rgba(124,58,237,0.7)); }
			</style>
		</head>
		<body>
			<h2>Three ways in</h2>

			<div class="diagram">
				<svg class="lines" viewBox="0 0 1100 520" preserveAspectRatio="none">
					<path id="line-browser" d="M 240 105 C 340 180, 430 230, 540 250" />
					<path id="line-cluster" d="M 860 105 C 760 180, 670 230, 560 250" />
					<path id="line-mcp" d="M 550 440 L 550 340" />
				</svg>

				<div class="hub" id="hub">
					<div class="name">Datamonkey 3</div>
				</div>

				<div class="spoke" id="browser">
					<div class="label">Interactive</div>
					<div class="glyph icon">&#x1F310;</div>
					<div class="name">Browser</div>
				</div>

				<div class="spoke" id="cluster">
					<div class="label">Heavy compute</div>
					<div class="glyph">${socketio}</div>
					<div class="name">Socket.IO &middot; SLURM</div>
				</div>

				<div class="spoke mcp-card" id="mcp">
					<div class="label">Agent-ready</div>
					<div class="glyph wide">${mcp}</div>
				</div>
			</div>
		</body>
		</html>
	`);

	// Apply highlight state and screenshot for each of the three spokes.
	const variants = [
		{ name: 'browser', spoke: 'browser', line: 'line-browser' },
		{ name: 'cluster', spoke: 'cluster', line: 'line-cluster' },
		{ name: 'mcp', spoke: 'mcp', line: 'line-mcp' }
	];

	for (const v of variants) {
		await page.evaluate(({ spoke, line }) => {
			// Reset classes
			for (const id of ['browser', 'cluster', 'mcp']) {
				const el = document.getElementById(id);
				el.classList.remove('bright', 'dim');
			}
			for (const id of ['line-browser', 'line-cluster', 'line-mcp']) {
				document.getElementById(id).classList.remove('bright');
			}

			// Apply new state
			for (const id of ['browser', 'cluster', 'mcp']) {
				const el = document.getElementById(id);
				if (id === spoke) el.classList.add('bright');
				else el.classList.add('dim');
			}
			document.getElementById(line).classList.add('bright');
		}, v);

		// Let the CSS transition settle
		await page.waitForTimeout(500);

		await page.screenshot({
			path: `video-frames/scene-a4-highlight-${v.name}.png`,
			fullPage: false
		});
	}
});
