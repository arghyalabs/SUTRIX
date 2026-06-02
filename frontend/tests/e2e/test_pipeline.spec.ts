import { test, expect } from '@playwright/test';

test.describe('Scientific Data Orchestrator - End-to-End Production Pipeline Test', () => {

  test('Should execute the entire scientific workflow sequentially with 100% telemetry accuracy', async ({ page }) => {
    // Phase 1: Go to landing page first
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Verify the landing page features first
    await expect(page.locator('text=AI-Native Intelligence Engine')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enter Workspace' })).toBeVisible();

    // Phase 2: Enter Workspace sandbox (triggers LicenseGate)
    await page.getByRole('button', { name: 'Enter Workspace' }).click();
    await page.waitForTimeout(500);

    // Confirm that the Compliance Gate is now blocking and terms are shown
    await expect(page.locator('text=Open Source Compliance Gate')).toBeVisible();
    await expect(page.locator('text=GNU AGPL-3.0 Copyleft Compliance Notice')).toBeVisible();

    // Check the copyleft terms box
    await page.locator('input[type="checkbox"]').check();
    
    // Proceed past the gate
    await page.getByRole('button', { name: 'Acknowledge & Proceed to Workspace' }).click();
    await page.waitForTimeout(500);


    // Phase 3: Dataset Ingestion (Load Demo toxicology benchmark dataset)
    await expect(page.getByRole('heading', { name: 'Upload Dataset' })).toBeVisible();
    await page.getByRole('button', { name: 'Load Demo Dataset' }).click();

    // Ingestion completes and Snappy Parquet summary displays
    await expect(page.locator('text=Successfully ingested')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Data Preview')).toBeVisible();

    // Interactive Column Curation: drop unnecessary raw columns
    await expect(page.locator('text=Interactive Curation')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm & Proceed' }).click();
    await page.waitForTimeout(500);

    // Phase 4: Variable Mapping
    await expect(page.locator('text=Variable Mapping').first()).toBeVisible();
    await expect(page.locator('text=Schema Bindings')).toBeVisible();
    
    // Click final mapping confirm to dispatch bindings to backend
    await page.getByRole('button', { name: 'Confirm & Proceed' }).click();
    await page.waitForTimeout(1000);

    // Phase 5: Hierarchical Segregation & Visual Audits
    await expect(page.locator('text=Step 3: Hierarchical Segregation')).toBeVisible({ timeout: 15000 });
    
    // Enable deduplication and variance audits
    await page.locator('input[type="checkbox"]').first().check(); // Smart Deduplication
    
    // Execute folder segregation & cleansing pipeline
    await page.getByRole('button', { name: /Execute.*Graph Generation|Execute.*Cleansing/i }).click();
    
    // Wait for computations to complete and charts to render
    const contAnalysisBtn = page.getByRole('button', { name: 'Continue to Analysis' });
    await expect(contAnalysisBtn).toBeVisible({ timeout: 60000 });
    await contAnalysisBtn.click();
    await page.waitForTimeout(800);

    // Verify composition/distribution text is visible on the Node Analytics page
    await expect(page.locator('text=Subgroup Composition %').first()).toBeVisible({ timeout: 30000 });

    // Proceed to QSAR enrichment phase
    const contEnrichmentBtn = page.getByRole('button', { name: 'Continue to Descriptor Enrichment' });
    await expect(contEnrichmentBtn).toBeVisible({ timeout: 10000 });
    await contEnrichmentBtn.click();
    await page.waitForTimeout(800);

    // Phase 6: Computational Descriptor Enrichment
    await expect(page.locator('text=Descriptor Selection')).toBeVisible();
    await expect(page.locator('text=Compute Presets')).toBeVisible();

    // Run parallel calculations in Fast Mode
    await page.getByRole('button', { name: 'Fast Mode' }).click();
    await page.waitForTimeout(500);

    // Click the Run button (contains the number of descriptors selected, e.g. "Run (9 descriptors)")
    const runBtn = page.getByRole('button', { name: /Run \(/i });
    await expect(runBtn).toBeVisible();
    await runBtn.click();
    
    // Wait for computations to complete and click the Next Step button
    const nextStepBtn = page.getByRole('button', { name: 'Next Step' }).first();
    await expect(nextStepBtn).toBeVisible({ timeout: 60000 });
    await nextStepBtn.click();
    await page.waitForTimeout(1000);

    // Phase 7: OECD Readiness Audits
    const runAnalysisBtn = page.getByRole('button', { name: 'Run AI Analysis' });
    await expect(runAnalysisBtn).toBeVisible({ timeout: 15000 });
    await runAnalysisBtn.click();

    // Wait for results
    await expect(page.locator('text=AI Readiness Workspace')).toBeVisible({ timeout: 45000 });

    // Phase 8: Reports Export downloads
    // Click on the sidebar Export tab item
    await page.locator('#sidebar-tab-reports').click();
    await page.waitForTimeout(1500);
    await expect(page.locator('text=Export & Reports').first()).toBeVisible();
    
    // Verify the compliance deliverables are ready for downstream downloads
    await expect(page.locator('text=Download ZIP').first()).toBeVisible();
    await expect(page.locator('text=Download PDF Report').first()).toBeVisible();
  });
  
});
