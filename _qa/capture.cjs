const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('guest-shell')) errors.push(msg.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:5205/', { waitUntil: 'networkidle' });
    const idleCanvas = await page.locator('canvas').count();
    const idleHeavyResources = await page.evaluate(() => performance.getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => name.includes('InkExperience') || name.includes('noise_1')));
    await page.screenshot({ path: `_qa/ui/${viewport.width}x${viewport.height}-idle.png` });
    await page.locator('[data-start]').dispatchEvent('pointerdown', {
      pointerId: 1, pointerType: 'touch', clientX: viewport.width / 2, clientY: viewport.height * .6,
      bubbles: true, isPrimary: true
    });
    await page.waitForFunction(() => document.querySelector('.iw-app')?.dataset.state === 'active', null, { timeout: 15000 });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `_qa/ui/${viewport.width}x${viewport.height}-ghost.png` });
    await page.locator('#canvas').dispatchEvent('pointerdown', {
      pointerId: 31, pointerType: 'touch', clientX: viewport.width * .35, clientY: viewport.height * .55,
      bubbles: true, isPrimary: true
    });
    await page.locator('#canvas').dispatchEvent('pointerdown', {
      pointerId: 32, pointerType: 'touch', clientX: viewport.width * .65, clientY: viewport.height * .55,
      bubbles: true
    });
    await page.locator('#canvas').dispatchEvent('pointermove', {
      pointerId: 32, pointerType: 'touch', clientX: viewport.width * .82, clientY: viewport.height * .55,
      bubbles: true
    });
    const water = await page.locator('#canvas').getAttribute('data-water');
    for (const pointerId of [31, 32]) {
      await page.locator('#canvas').dispatchEvent('pointerup', {
        pointerId, pointerType: 'touch', clientX: viewport.width / 2, clientY: viewport.height * .55,
        bubbles: true
      });
    }
    const points = [
      [.18, .70], [.30, .55], [.46, .67], [.63, .48], [.78, .64], [.34, .40], [.70, .34]
    ];
    for (let pass = 0; pass < 8; pass++) {
      const seq = pass % 2 ? [...points].reverse() : points;
      const first = seq[0];
      await page.locator('#canvas').dispatchEvent('pointerdown', {
        pointerId: 10, pointerType: 'touch', clientX: viewport.width * first[0], clientY: viewport.height * first[1],
        bubbles: true, isPrimary: true
      });
      for (const [x, y] of seq) {
        await page.locator('#canvas').dispatchEvent('pointermove', {
          pointerId: 10, pointerType: 'touch', clientX: viewport.width * x, clientY: viewport.height * y,
          bubbles: true, isPrimary: true
        });
        await page.waitForTimeout(35);
      }
      await page.locator('#canvas').dispatchEvent('pointerup', {
        pointerId: 10, pointerType: 'touch', clientX: viewport.width * seq.at(-1)[0], clientY: viewport.height * seq.at(-1)[1],
        bubbles: true, isPrimary: true
      });
    }
    await page.waitForTimeout(700);
    await page.screenshot({ path: `_qa/ui/${viewport.width}x${viewport.height}-result.png` });
    const state = await page.locator('.iw-app').getAttribute('data-state');
    const progress = await page.locator('[data-progress]').textContent();
    const canvasBox = await page.locator('#canvas').boundingBox();
    const resultBox = await page.locator('.iw-result').boundingBox();
    console.log(JSON.stringify({ viewport, idleCanvas, idleHeavyResources, water, state, progress, canvasBox, resultBox, errors }));
    await context.close();
  }
  await browser.close();
})();
