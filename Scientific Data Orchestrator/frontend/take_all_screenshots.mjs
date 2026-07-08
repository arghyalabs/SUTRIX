import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Target folder for screenshots
const SCREENSHOT_DIR = path.resolve(__dirname, '../../thesis_assets/screenshots');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const BASE_URL = 'http://127.0.0.1:5173';

async function loadDemoAndProceed(p) {
  try {
    const demoBtn = p.locator('button:has-text("Load Demo Dataset"), button:has-text("Demo")').first();
    if (await demoBtn.count() > 0 && await demoBtn.isVisible()) {
      await demoBtn.click();
      console.log('  Loaded demo dataset.');
      await p.waitForTimeout(2000);
      
      const confirmBtn = p.locator('button:has-text("Confirm & Proceed"), button:has-text("Proceed"), button:has-text("Confirm")').first();
      if (await confirmBtn.count() > 0 && await confirmBtn.isVisible()) {
        await confirmBtn.click();
        console.log('  Clicked Confirm & Proceed.');
        await p.waitForTimeout(2000);
      }
    }
  } catch (e) {
    console.error('  Failed during demo load/proceed sequence:', e.message);
  }
}

async function tryCapture(page, url, screenshotName, actionsCallback = null) {
  try {
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Bypass any dialogs / modals if they appear
    try {
      const modalClose = page.locator('button:has-text("Close"), button:has-text("Cancel"), button[class*="close"]').first();
      if (await modalClose.count() > 0 && await modalClose.isVisible()) {
        await modalClose.click();
        await page.waitForTimeout(500);
      }
    } catch (e) {}

    if (actionsCallback) {
      await actionsCallback(page);
    }

    const savePath = path.join(SCREENSHOT_DIR, screenshotName);
    await page.screenshot({ path: savePath });
    console.log(`[SAVED] ${screenshotName} -> ${savePath}`);
  } catch (err) {
    console.error(`[ERROR] Failed to capture ${screenshotName} from ${url}:`, err.message);
  }
}

(async () => {
  console.log('Launching Playwright Chrome...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  // Set default timeout to 5 seconds
  page.setDefaultTimeout(5000);

  // Handle license gate
  await page.addInitScript(() => {
    window.localStorage.setItem('sdo_agpl_agreed', 'true');
  });

  // 1. Landing Page
  await tryCapture(page, BASE_URL, 'landing_page.png');

  // 2. Workspace Selection Hub
  await tryCapture(page, `${BASE_URL}/hub`, 'workspace_hub.png');

  // 3. Normalization Studio
  await tryCapture(page, `${BASE_URL}/normalization`, 'normalization_upload.png', async (p) => {
    const demoBtn = p.locator('button:has-text("Load Normalization Demo Dataset"), button:has-text("Demo")').first();
    if (await demoBtn.count() > 0) {
      await demoBtn.click();
      console.log('  Loaded Normalization Demo Dataset.');
      await p.waitForTimeout(2000);
    }
  });

  // Normalization Studio tabs
  const normTabs = [
    { name: 'Intelligent Normalization', file: 'normalization_deduplication.png' },
    { name: 'Log Transformation', file: 'normalization_log_transform.png' },
    { name: 'Endpoint Standardization', file: 'normalization_endpoint.png' },
    { name: 'Species Normalization', file: 'normalization_species.png' },
    { name: 'OECD Quality Checks', file: 'normalization_oecd_quality.png' },
    { name: 'Data Quality Score', file: 'normalization_quality_score.png' }
  ];

  for (const nt of normTabs) {
    await tryCapture(page, `${BASE_URL}/normalization`, nt.file, async (p) => {
      const btn = p.locator(`button:has-text("${nt.name}")`).first();
      if (await btn.count() > 0) {
        await btn.click();
        await p.waitForTimeout(1000);
      }
    });
  }

  // 4. Analytics Studio tabs
  await tryCapture(page, `${BASE_URL}/analytics`, 'analytics_upload.png', async (p) => {
    await loadDemoAndProceed(p);
  });

  const analTabs = [
    { name: 'Dataset Profile', file: 'analytics_profile.png' },
    { name: 'Missing Value Analysis', file: 'analytics_missingness.png' },
    { name: 'Endpoint Diagnostics', file: 'analytics_endpoint_diagnostics.png' },
    { name: 'Correlation Matrix', file: 'analytics_correlation.png' },
    { name: 'Outlier Detection', file: 'analytics_outlier.png' },
    { name: 'Distribution Analysis', file: 'analytics_distribution.png' }
  ];

  for (const at of analTabs) {
    await tryCapture(page, `${BASE_URL}/analytics`, at.file, async (p) => {
      const btn = p.locator(`button:has-text("${at.name}")`).first();
      if (await btn.count() > 0) {
        await btn.click();
        await p.waitForTimeout(1000);
      }
    });
  }

  // 5. Hierarchy Studio
  await tryCapture(page, `${BASE_URL}/hierarchy`, 'hierarchy_builder.png', async (p) => {
    const demoBtn = p.locator('button:has-text("Load Demo Dataset"), button:has-text("Demo")').first();
    if (await demoBtn.count() > 0) {
      await demoBtn.click();
      await p.waitForTimeout(2000);
    }
    // Select dimensions
    const availableBtns = p.locator('button:has-text("Trophic Level"), button:has-text("Species"), button:has-text("Duration")');
    const count = await availableBtns.count();
    for (let i = 0; i < Math.min(count, 2); i++) {
      await availableBtns.nth(i).click();
      await p.waitForTimeout(300);
    }
    const execBtn = p.locator('button:has-text("Execute Graph Generation")').first();
    if (await execBtn.count() > 0) {
      await execBtn.click();
      await p.waitForTimeout(3000);
    }
  });

  // 6. QSAR Studio panels
  await tryCapture(page, `${BASE_URL}/qsar`, 'qsar_upload.png', async (p) => {
    await loadDemoAndProceed(p);
  });

  const qsarSteps = [
    { name: 'Descriptor Engineering', file: 'qsar_enrichment.png' },
    { name: 'Applicability Domain', file: 'qsar_readiness.png' },
    { name: 'OECD Audit', file: 'qsar_oecd_audit.png' }
  ];

  for (const qs of qsarSteps) {
    await tryCapture(page, `${BASE_URL}/qsar`, qs.file, async (p) => {
      const btn = p.locator(`button:has-text("${qs.name}")`).first();
      if (await btn.count() > 0) {
        await btn.click();
        await p.waitForTimeout(1500);
      }
    });
  }

  // 7. OECD Validation Studio
  await tryCapture(page, `${BASE_URL}/oecd`, 'oecd_validation_dashboard.png', async (p) => {
    await loadDemoAndProceed(p);
  });

  // 8. Intelligence Studio
  await tryCapture(page, `${BASE_URL}/intelligence`, 'intelligence_dashboard.png', async (p) => {
    await loadDemoAndProceed(p);
  });

  // 9. Compound Explorer Studio
  await tryCapture(page, `${BASE_URL}/compound`, 'compound_explorer.png', async (p) => {
    await loadDemoAndProceed(p);
    const searchInput = p.locator("input[placeholder*='Compound Name'], input[placeholder*='SMILES']").first();
    if (await searchInput.count() > 0) {
      await searchInput.fill('CCO');
      const searchBtn = p.locator('button:has-text("Search")').first();
      if (await searchBtn.count() > 0) {
        await searchBtn.click();
        await p.waitForTimeout(2000);
      }
    }
  });

  console.log('Screenshot capture process finished!');
  await browser.close();
})();
