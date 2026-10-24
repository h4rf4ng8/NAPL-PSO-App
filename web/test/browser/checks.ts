import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';

export async function captureAndAudit(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => globalThis.document.fonts.ready);
  await info.attach(name, { body: await page.screenshot({ fullPage: true, animations: 'disabled' }), contentType: 'image/png' });
  const overflow = await page.evaluate(() => Math.max(globalThis.document.documentElement.scrollWidth, globalThis.document.body.scrollWidth) - globalThis.document.documentElement.clientWidth);
  expect.soft(overflow, `${name}: only table containers may scroll horizontally`).toBeLessThanOrEqual(1);
  const overlappingControls = await page.evaluate(() => {
    const heading = globalThis.document.querySelector('#page-heading');
    if (!heading) return [];
    const title = heading.getBoundingClientRect();
    return [...(heading.closest('header')?.querySelectorAll('button, [role="combobox"]') ?? [])].filter(control => {
      const box = control.getBoundingClientRect();
      return Math.min(title.right, box.right) - Math.max(title.left, box.left) > 1 && Math.min(title.bottom, box.bottom) - Math.max(title.top, box.top) > 1;
    }).map(control => control.getAttribute('aria-label') || control.textContent);
  });
  expect.soft(overlappingControls, `${name}: page title must not overlap header controls`).toEqual([]);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  await info.attach(`${name}-accessibility`, { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
  expect.soft(results.violations.map(({ id, impact, nodes }) => ({ id, impact, targets: nodes.map(node => node.target) })), `${name}: WCAG A/AA violations`).toEqual([]);
}
