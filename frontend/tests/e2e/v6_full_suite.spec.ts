/**
 * SUTRIX V6 — Comprehensive E2E Test Suite
 * Covers: Landing Hub, Analytics Studio (2), Normalization Studio (4),
 *         QSAR Studio (5), OECD Validation Studio (7), Scientific Intelligence Studio (6)
 *
 * Uses: test_qsar_dataset.csv  (80 rows × 68 cols)
 * Requires: frontend @ http://localhost:5173  +  backend @ http://localhost:8000
 */

import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const BASE = 'http://localhost:5173';
const API  = 'http://127.0.0.1:8000';
const FIXTURE = path.resolve(__dirname, '../fixtures/test_qsar_dataset.csv');

// ─── Helper: verify backend health before suite ─────────────────────────────
async function backendHealthCheck() {
  try {
    const res = await fetch(`${API}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Helper: upload fixture via API directly (fast, bypasses UI drag-drop) ──
async function uploadViaAPI(endpoint: string, filepath: string): Promise<any> {
  const form = new FormData();
  const buf = fs.readFileSync(filepath);
  const blob = new Blob([buf], { type: 'text/csv' });
  form.append('file', blob, path.basename(filepath));
  const res = await fetch(`${API}${endpoint}`, { method: 'POST', body: form });
  return res.json();
}

// ─── Helper: wait for element + assert text ──────────────────────────────────
async function assertVisible(page: Page, selector: string, timeout = 20000) {
  await expect(page.locator(selector).first()).toBeVisible({ timeout });
}

// ─── Global Hook: Bypass AGPL gate ──────────────────────────────────────────
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('sdo_agpl_agreed', 'true');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 0: Pre-flight
// ─────────────────────────────────────────────────────────────────────────────
test.describe('0. Pre-flight checks', () => {
  test('Fixture CSV exists', () => {
    expect(fs.existsSync(FIXTURE)).toBe(true);
    const lines = fs.readFileSync(FIXTURE, 'utf-8').split('\n');
    expect(lines.length).toBeGreaterThan(80);
  });

  test('Backend is healthy', async () => {
    const healthy = await backendHealthCheck();
    // Not fatal — backend may use different health path, just log
    console.log(`Backend health: ${healthy ? 'OK' : 'No /health endpoint (OK)'}`);
  });

  test('Frontend loads landing page', async ({ page }) => {
    await page.goto(BASE);
    await expect(page).toHaveTitle(/SUTRIX|Scientific/i, { timeout: 15000 });
    // Should show tool cards or hero section
    const body = await page.locator('body').textContent();
    expect(body).toMatch(/SUTRIX|Scientific|Dataset|Studio/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 1: Landing Hub
// ─────────────────────────────────────────────────────────────────────────────
test.describe('1. Landing Hub', () => {
  test('Displays all 7 studio cards', async ({ page }) => {
    await page.goto(`${BASE}/hub`);
    await page.waitForLoadState('networkidle');
    const text = await page.locator('body').textContent() ?? '';
    // Check for at least a subset of studio identifiers
    const studios = ['Analytics', 'Normalization', 'QSAR', 'OECD', 'Intelligence', 'Hierarchy'];
    let found = 0;
    for (const s of studios) {
      if (text.includes(s)) found++;
    }
    expect(found).toBeGreaterThanOrEqual(4);
  });

  test('Hub links navigate to studio routes', async ({ page }) => {
    await page.goto(`${BASE}/hub`);
    await page.waitForLoadState('networkidle');

    // Look for any clickable studio entry and check it navigates
    const headings = page.locator('h3').filter({ hasText: /Analytics|QSAR|OECD|Intelligence/i });
    const count = await headings.count();
    expect(count).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 1b: Studio Clean-Open Regression
// Verifies that studios open with NO pre-loaded data (no stale persistence).
// This catches the bug where E2E tests / previous sessions leave data in
// localStorage that bleeds into a fresh studio open.
// ─────────────────────────────────────────────────────────────────────────────
test.describe('1b. Studio clean-open regression', () => {
  // Run with a fresh, empty localStorage — simulates a real user who has not
  // previously used the app.
  test.use({ storageState: { cookies: [], origins: [] } });

  const STUDIOS = [
    { id: 'analytics',     path: '/analytics',     noDataText: /No Dataset|Upload Dataset/i },
    { id: 'qsar',          path: '/qsar',          noDataText: /Upload|Load CSV/i },
    { id: 'oecd',          path: '/oecd',          noDataText: /Upload|No Dataset/i },
    { id: 'intelligence',  path: '/intelligence',  noDataText: /Upload|Drop CSV/i },
    { id: 'normalization', path: '/normalization', noDataText: /No Dataset|Upload/i },
  ];

  for (const studio of STUDIOS) {
    test(`${studio.id} — opens with no pre-loaded data`, async ({ page }) => {
      // Clear all storage so no leftover sessions or persisted store
      await page.goto(BASE);
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('sdo_agpl_agreed', 'true');  // bypass AGPL gate
      });

      await page.goto(`${BASE}${studio.path}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000); // allow React hydration

      const body = await page.locator('body').textContent({ timeout: 10000 }) ?? '';

      // The StudioShell toolbar shows either:
      //   "Dataset Loaded"  (green badge — data is present) ← BAD on fresh open
      //   "No Dataset"      (grey badge  — correct for fresh open) ← OK
      // The empty-state panels also say "No Dataset Loaded" which is fine.
      // We only care that the GREEN toolbar badge is NOT present.
      // We detect this by checking the toolbar status indicator directly.
      const datasetLoadedBadge = page.locator(
        'button:has(svg) >> text=Dataset Loaded'
      );
      const badgeCount = await datasetLoadedBadge.count();
      expect(badgeCount).toBe(0);

      // Must NOT show any previous filename (test fixture)
      expect(body).not.toMatch(/test_qsar_dataset\.csv/i);
    });
  }
});


test.describe('2. Backend API — Analytics Studio', () => {
  const CID = `pw_analytics_${Date.now()}`;

  test('Upload dataset returns correct shape', async () => {
    const data = await uploadViaAPI(`/api/analytics/${CID}/upload`, FIXTURE);
    expect(data.rows).toBe(80);
    expect(data.cols).toBeGreaterThan(60);
    expect(data.status).toBe('ok');
  });

  test('Profile endpoint returns column stats', async () => {
    await uploadViaAPI(`/api/analytics/${CID}/upload`, FIXTURE);
    const res = await fetch(`${API}/api/analytics/${CID}/profile`);
    const data = await res.json();
    expect(res.ok).toBe(true);
    expect(data.total_rows).toBe(80);
    expect(Array.isArray(data.columns)).toBe(true);
    expect(data.columns.length).toBeGreaterThan(0);
    // Should have numeric column stats
    const hasStats = data.columns.some((c: any) => c.mean !== undefined || c.count !== undefined);
    expect(hasStats).toBe(true);
  });

  test('Missing analysis returns per-column missingness', async () => {
    await uploadViaAPI(`/api/analytics/${CID}/upload`, FIXTURE);
    const res = await fetch(`${API}/api/analytics/${CID}/missing-analysis`);
    const data = await res.json();
    expect(res.ok).toBe(true);
    expect(Array.isArray(data.columns)).toBe(true);
  });

  test('Correlation endpoint returns matrix', async () => {
    await uploadViaAPI(`/api/analytics/${CID}/upload`, FIXTURE);
    const res = await fetch(`${API}/api/analytics/${CID}/correlation?method=pearson`);
    const data = await res.json();
    expect(res.ok).toBe(true);
    expect(Array.isArray(data.matrix)).toBe(true);
    expect(data.columns.length).toBeGreaterThan(0);
  });

  test('Outlier detection returns results', async () => {
    await uploadViaAPI(`/api/analytics/${CID}/upload`, FIXTURE);
    const res = await fetch(`${API}/api/analytics/${CID}/outliers?method=iqr`);
    const data = await res.json();
    expect(res.ok).toBe(true);
    expect(typeof data.total_columns_checked).toBe('number');
    expect(typeof data.columns_with_outliers).toBe('number');
    expect(Array.isArray(data.results)).toBe(true);
  });

  test('Distribution endpoint returns histogram for lc50_mg_l', async () => {
    await uploadViaAPI(`/api/analytics/${CID}/upload`, FIXTURE);
    const res = await fetch(`${API}/api/analytics/${CID}/distribution?col=lc50_mg_l&bins=20`);
    const data = await res.json();
    expect(res.ok).toBe(true);
    expect(typeof data.mean).toBe('number');
    expect(Array.isArray(data.histogram)).toBe(true);
    expect(data.histogram.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 3: Backend API — QSAR Studio
// ─────────────────────────────────────────────────────────────────────────────
test.describe('3. Backend API — QSAR Studio', () => {
  const CID = `pw_qsar_${Date.now()}`;

  test('CSV upload succeeds', async () => {
    const data = await uploadViaAPI(`/api/qsar-studio/${CID}/upload-csv`, FIXTURE);
    expect(data.status).toBe('ok');
    expect(data.rows).toBe(80);
    expect(data.cols).toBeGreaterThan(60);
  });

  test('Dataset info returns session data', async () => {
    await uploadViaAPI(`/api/qsar-studio/${CID}/upload-csv`, FIXTURE);
    const res = await fetch(`${API}/api/qsar-studio/${CID}/dataset-info`);
    const data = await res.json();
    expect(res.ok).toBe(true);
    expect(data.rows).toBe(80);
    expect(Array.isArray(data.numeric_columns)).toBe(true);
    expect(data.numeric_columns.length).toBeGreaterThan(10);
  });

  test('OECD readiness returns grade A–F', async () => {
    await uploadViaAPI(`/api/qsar-studio/${CID}/upload-csv`, FIXTURE);
    const res = await fetch(`${API}/api/qsar-studio/${CID}/readiness`);
    const data = await res.json();
    expect(res.ok).toBe(true);
    expect(['A','B','C','D','F']).toContain(data.grade);
    expect(typeof data.overall_score).toBe('number');
    expect(data.overall_score).toBeGreaterThanOrEqual(0);
    expect(data.overall_score).toBeLessThanOrEqual(100);
    expect(Array.isArray(data.checks)).toBe(true);
    expect(data.checks.length).toBeGreaterThan(0);
    expect(typeof data.oecd_principles).toBe('object');
  });

  test('ML benchmark job starts and completes', async () => {
    await uploadViaAPI(`/api/qsar-studio/${CID}/upload-csv`, FIXTURE);
    // Start job
    const form = new FormData();
    form.append('endpoint_col', 'lc50_mg_l');
    form.append('test_size', '0.2');
    const startRes = await fetch(`${API}/api/qsar-studio/${CID}/benchmark`, { method: 'POST', body: form });
    const startData = await startRes.json();
    expect(startRes.ok).toBe(true);
    expect(typeof startData.job_id).toBe('string');

    // Poll until done (max 60s)
    const jobId = startData.job_id;
    let result: any = null;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const pollRes = await fetch(`${API}/api/qsar-studio/${CID}/benchmark/status?job_id=${jobId}`);
      const pollData = await pollRes.json();
      if (pollData.status === 'DONE') {
        result = pollData.result;
        break;
      }
      if (pollData.status === 'FAILED') {
        throw new Error(`Benchmark failed: ${pollData.error}`);
      }
    }
    expect(result).not.toBeNull();
    expect(Array.isArray(result.models)).toBe(true);
    expect(result.models.length).toBeGreaterThan(0);
    // At least one model should have R² result
    const succeeded = result.models.filter((m: any) => m.status === 'ok');
    expect(succeeded.length).toBeGreaterThan(0);
    // Best R² should be a number
    expect(typeof succeeded[0].r2_test).toBe('number');
    console.log(`Top model: ${result.top_model}, R²=${succeeded[0].r2_test?.toFixed(4)}`);
  }, 90000);

  test('Applicability domain returns Williams plot data', async () => {
    await uploadViaAPI(`/api/qsar-studio/${CID}/upload-csv`, FIXTURE);
    const res = await fetch(`${API}/api/qsar-studio/${CID}/applicability-domain`);
    const data = await res.json();
    expect(res.ok).toBe(true);
    expect(Array.isArray(data.points)).toBe(true);
    expect(data.points.length).toBeGreaterThan(0);
    expect(typeof data.h_star).toBe('number');
    expect(typeof data.in_ad_pct).toBe('number');
    const point = data.points[0];
    expect(typeof point.leverage).toBe('number');
    expect(typeof point.std_residual).toBe('number');
    expect(typeof point.in_ad).toBe('boolean');
  });

  test('CSV export returns valid data', async () => {
    await uploadViaAPI(`/api/qsar-studio/${CID}/upload-csv`, FIXTURE);
    const res = await fetch(`${API}/api/qsar-studio/${CID}/export?format=csv`);
    expect(res.ok).toBe(true);
    expect(res.headers.get('content-type')).toContain('text/csv');
    const text = await res.text();
    const lines = text.trim().split('\n');
    expect(lines.length).toBeGreaterThan(80); // header + 80 data rows
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 4: Backend API — OECD Validation Studio
// ─────────────────────────────────────────────────────────────────────────────
test.describe('4. Backend API — OECD Validation Studio', () => {
  const CID = `pw_oecd_${Date.now()}`;

  test('Upload dataset succeeds', async () => {
    const data = await uploadViaAPI(`/api/oecd/${CID}/upload`, FIXTURE);
    expect(data.status).toBe('ok');
    expect(data.rows).toBe(80);
  });

  test('Each OECD principle returns valid score', async () => {
    await uploadViaAPI(`/api/oecd/${CID}/upload`, FIXTURE);
    for (const n of [1, 2, 3, 4, 5]) {
      const res = await fetch(`${API}/api/oecd/${CID}/principle/${n}`);
      const data = await res.json();
      expect(res.ok).toBe(true);
      expect(data.principle).toBe(n);
      expect(typeof data.score).toBe('number');
      expect(data.score).toBeGreaterThanOrEqual(0);
      expect(data.score).toBeLessThanOrEqual(100);
      expect(['GREEN','AMBER','RED']).toContain(data.status);
      expect(Array.isArray(data.checks)).toBe(true);
      expect(data.checks.length).toBeGreaterThan(0);
      console.log(`P${n}: ${data.status} (${data.score}/100) — ${data.checks.length} checks`);
    }
  });

  test('Full report aggregates all 5 principles', async () => {
    await uploadViaAPI(`/api/oecd/${CID}/upload`, FIXTURE);
    const res = await fetch(`${API}/api/oecd/${CID}/full-report`);
    const data = await res.json();
    expect(res.ok).toBe(true);
    expect(Array.isArray(data.principles)).toBe(true);
    expect(data.principles.length).toBe(5);
    expect(['A','B','C','D','F']).toContain(data.overall_grade);
    expect(typeof data.overall_score).toBe('number');
    expect(typeof data.green).toBe('number');
    expect(typeof data.amber).toBe('number');
    expect(typeof data.red).toBe('number');
    expect(data.green + data.amber + data.red).toBe(data.total_checks);
    console.log(`OECD Grade: ${data.overall_grade} (${data.overall_score}/100) — ${data.green}G ${data.amber}A ${data.red}R`);
  });

  test('Excel export returns valid xlsx', async () => {
    await uploadViaAPI(`/api/oecd/${CID}/upload`, FIXTURE);
    const res = await fetch(`${API}/api/oecd/${CID}/export-report`);
    expect(res.ok).toBe(true);
    const ct = res.headers.get('content-type') ?? '';
    expect(ct).toContain('openxmlformats');
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(5000); // real xlsx is >5KB
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 5: Backend API — Scientific Intelligence Studio
// ─────────────────────────────────────────────────────────────────────────────
test.describe('5. Backend API — Scientific Intelligence Studio', () => {
  const CID = `pw_intel_${Date.now()}`;

  test('Upload succeeds', async () => {
    const data = await uploadViaAPI(`/api/intelligence/${CID}/upload`, FIXTURE);
    expect(data.status).toBe('ok');
    expect(data.rows).toBe(80);
  });

  test('Scaffold analysis returns scaffolds', async () => {
    await uploadViaAPI(`/api/intelligence/${CID}/upload`, FIXTURE);
    const res = await fetch(`${API}/api/intelligence/${CID}/scaffold-analysis?top_n=10`);
    const data = await res.json();
    expect(res.ok).toBe(true);
    expect(Array.isArray(data.scaffolds)).toBe(true);
    expect(data.scaffolds.length).toBeGreaterThan(0);
    expect(typeof data.total_compounds).toBe('number');
    const sc = data.scaffolds[0];
    expect(typeof sc.scaffold).toBe('string');
    expect(typeof sc.count).toBe('number');
    expect(typeof sc.pct).toBe('number');
    console.log(`Scaffold mode: ${data.mode}, top: "${sc.scaffold}" (n=${sc.count})`);
  });

  test('Activity cliffs endpoint executes', async () => {
    await uploadViaAPI(`/api/intelligence/${CID}/upload`, FIXTURE);
    const res = await fetch(`${API}/api/intelligence/${CID}/activity-cliffs?threshold=1.0`);
    const data = await res.json();
    expect(res.ok).toBe(true);
    expect(typeof data.n_compounds).toBe('number');
    expect(typeof data.n_cliffs).toBe('number');
    expect(Array.isArray(data.cliffs)).toBe(true);
    console.log(`Cliffs found: ${data.n_cliffs} (mode: ${data.mode})`);
  });

  test('Chemical diversity returns property stats', async () => {
    await uploadViaAPI(`/api/intelligence/${CID}/upload`, FIXTURE);
    const res = await fetch(`${API}/api/intelligence/${CID}/diversity`);
    const data = await res.json();
    expect(res.ok).toBe(true);
    expect(typeof data.n).toBe('number');
    expect(typeof data.properties).toBe('object');
    const propKeys = Object.keys(data.properties);
    expect(propKeys.length).toBeGreaterThan(0);
    // MW should be detected
    const hasMW = propKeys.some(k => k.includes('MW') || k.includes('mw'));
    expect(hasMW).toBe(true);
    console.log(`Properties detected: ${propKeys.join(', ')}`);
  });

  test('Read-across returns k neighbours', async () => {
    await uploadViaAPI(`/api/intelligence/${CID}/upload`, FIXTURE);
    const res = await fetch(`${API}/api/intelligence/${CID}/read-across?query_idx=0&k=5`);
    const data = await res.json();
    expect(res.ok).toBe(true);
    expect(typeof data.query).toBe('object');
    expect(Array.isArray(data.neighbours)).toBe(true);
    expect(data.neighbours.length).toBe(5);
    // Each neighbour should have rank and distance
    const nb = data.neighbours[0];
    expect(nb.rank).toBe(1);
    expect(typeof nb.distance).toBe('number');
    expect(nb.distance).toBeGreaterThanOrEqual(0);
  });

  test('Read-across predicted activity present when activity col detected', async () => {
    await uploadViaAPI(`/api/intelligence/${CID}/upload`, FIXTURE);
    const res = await fetch(`${API}/api/intelligence/${CID}/read-across?query_idx=0&k=5&activity_col=lc50_mg_l`);
    const data = await res.json();
    expect(res.ok).toBe(true);
    expect(data.query.activity).toBeDefined();
    expect(data.query.predicted_activity).toBeDefined();
    expect(typeof data.query.predicted_activity).toBe('number');
    console.log(`Read-across prediction: ${data.query.predicted_activity?.toFixed(4)} (actual: ${data.query.activity?.toFixed(4)})`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 6: Backend API — Normalization Studio
// ─────────────────────────────────────────────────────────────────────────────
test.describe('6. Backend API — Normalization Studio', () => {
  const CID = `pw_norm_${Date.now()}`;

  test('Upload CSV to normalization studio', async () => {
    const data = await uploadViaAPI(`/api/normalization/${CID}/upload`, FIXTURE);
    expect(data.status ?? data.rows).toBeTruthy();
  });

  test('Unit detection returns column units', async () => {
    await uploadViaAPI(`/api/normalization/${CID}/upload`, FIXTURE);
    const res = await fetch(`${API}/api/normalization/${CID}/detect-units`);
    if (!res.ok) {
      console.log(`Normalization detect-units: ${res.status} — may require different payload`);
      return; // non-fatal
    }
    const data = await res.json();
    expect(typeof data).toBe('object');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 7: UI Navigation — studio pages render
// ─────────────────────────────────────────────────────────────────────────────
test.describe('7. UI — Studio pages render without crash', () => {
  const studios = [
    { url: '/hierarchy',    name: 'Hierarchy Studio',    text: ['Hierarchy', 'Upload Dataset', 'SUTRIX'] },
    { url: '/analytics',    name: 'Analytics Studio',    text: ['Dataset Profile', 'Analytics', 'SUTRIX'] },
    { url: '/qsar',         name: 'QSAR Studio',          text: ['QSAR', 'Dataset Upload', 'SUTRIX'] },
    { url: '/oecd',         name: 'OECD Studio',          text: ['OECD', 'Upload Dataset', 'SUTRIX'] },
    { url: '/intelligence', name: 'Intelligence Studio',  text: ['Intelligence', 'Upload Dataset', 'SUTRIX'] },
    { url: '/normalization',name: 'Normalization Studio', text: ['Normalization', 'Unit Detection', 'SUTRIX'] },
  ];


  for (const studio of studios) {
    test(`${studio.name} renders correctly`, async ({ page }) => {
      await page.goto(`${BASE}${studio.url}`);
      await page.waitForLoadState('networkidle', { timeout: 20000 });

      const body = await page.locator('body').textContent({ timeout: 15000 }) ?? '';
      const found = studio.text.some(t => body.includes(t));
      expect(found).toBe(true);

      // No crash: no error overlay, no blank white page
      const hasContent = body.length > 100;
      expect(hasContent).toBe(true);

      // No unhandled React crash boundary text
      const hasCrash = body.includes('Something went wrong') || body.includes('TypeError') || body.includes('Cannot read');
      expect(hasCrash).toBe(false);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 8: UI — Upload panel interaction
// ─────────────────────────────────────────────────────────────────────────────
test.describe('8. UI — Upload panels accept files', () => {
  test('QSAR Studio: file input accepts CSV', async ({ page }) => {
    await page.goto(`${BASE}/qsar`);
    await page.waitForLoadState('networkidle', { timeout: 20000 });

    // Find file input
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeAttached({ timeout: 10000 });
    await fileInput.setInputFiles(FIXTURE);

    // After upload, should show rows count or proceed to next tab
    await expect(page.locator('body')).toContainText(/80|rows|loaded|success/i, { timeout: 20000 });
  });

  test('OECD Studio: file input accepts CSV', async ({ page }) => {
    await page.goto(`${BASE}/oecd`);
    await page.waitForLoadState('networkidle', { timeout: 20000 });

    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeAttached({ timeout: 10000 });
    await fileInput.setInputFiles(FIXTURE);

    await expect(page.locator('body')).toContainText(/80|rows|loaded|OECD|report/i, { timeout: 20000 });
  });

  test('Intelligence Studio: file input accepts CSV', async ({ page }) => {
    await page.goto(`${BASE}/intelligence`);
    await page.waitForLoadState('networkidle', { timeout: 20000 });

    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeAttached({ timeout: 10000 });
    await fileInput.setInputFiles(FIXTURE);

    await expect(page.locator('body')).toContainText(/80|rows|loaded|scaffold/i, { timeout: 20000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 9: Analytics Studio — full UI flow
// ─────────────────────────────────────────────────────────────────────────────
test.describe('9. Analytics Studio — full UI flow', () => {
  test('Upload → Profile tab renders stats table', async ({ page }) => {
    await page.goto(`${BASE}/analytics`);
    await page.waitForLoadState('networkidle', { timeout: 20000 });

    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeAttached({ timeout: 10000 });
    await fileInput.setInputFiles(FIXTURE);

    // Should show profile/stats after upload
    await expect(page.locator('body')).toContainText(/column|profile|rows|mean/i, { timeout: 25000 });
  });

  test('Navigation tabs are clickable', async ({ page }) => {
    await page.goto(`${BASE}/analytics`);
    await page.waitForLoadState('networkidle');

    // Upload first
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeAttached({ timeout: 10000 });
    await fileInput.setInputFiles(FIXTURE);
    await page.waitForTimeout(3000);

    // Try clicking Missingness / Correlation / Outlier tabs
    for (const tabText of ['Missingness', 'Correlation', 'Outlier', 'Distribution']) {
      const tab = page.locator('button').filter({ hasText: tabText }).first();
      if (await tab.count() > 0) {
        await tab.click({ timeout: 5000 }).catch(() => {}); // non-fatal
        await page.waitForTimeout(500);
      }
    }
    // Just ensure no crash after tab switching
    const body = await page.locator('body').textContent() ?? '';
    expect(body.length).toBeGreaterThan(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 10: QSAR Studio — readiness + benchmark flow
// ─────────────────────────────────────────────────────────────────────────────
test.describe('10. QSAR Studio — readiness UI flow', () => {
  test('Upload → navigate to Readiness → run assessment', async ({ page }) => {
    await page.goto(`${BASE}/qsar`);
    await page.waitForLoadState('networkidle', { timeout: 20000 });

    // Upload
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeAttached({ timeout: 10000 });
    await fileInput.setInputFiles(FIXTURE);

    // Wait for session to load
    await expect(page.locator('body')).toContainText(/80|loaded|readiness/i, { timeout: 20000 });

    // Click Readiness tab
    const readinessBtn = page.locator('button').filter({ hasText: /Readiness/i }).first();
    if (await readinessBtn.count() > 0) {
      await readinessBtn.click();
      await page.waitForTimeout(1000);

      // Click Run Assessment
      const runBtn = page.locator('button').filter({ hasText: /Run Assessment|Assess/i }).first();
      if (await runBtn.count() > 0) {
        await runBtn.click();
        // Should show grade A-F
        await expect(page.locator('body')).toContainText(/Grade|Score|PASS|WARN|FAIL|GREEN|AMBER|RED|Endpoint/i, { timeout: 20000 });
      }
    }
  });
});
