import { expect, test } from "@playwright/test";

/**
 * Phase 1: Editor basics (validate the harness works)
 *
 * These tests verify the full pipeline:
 * Editor → MultiBuffer → DomRenderer → DOM
 *
 * The renderer uses data-attributes (not CSS classes) for DOM elements:
 * - [data-row] for line/header rows
 * - [data-cursor] for the cursor element
 * - textarea for the hidden input handler
 */

test.describe("Editor basics", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for editor to be ready (textarea present means InputHandler mounted)
    await page.waitForSelector("#editor textarea", { timeout: 10_000 });
  });

  test("page loads and #editor element exists", async ({ page }) => {
    const editor = page.locator("#editor");
    await expect(editor).toBeVisible();
  });

  test("lines render in the viewport", async ({ page }) => {
    // Lines are rendered as div[data-row] elements inside the scroll container
    const rows = page.locator("#editor [data-row]");
    await expect(rows.first()).toBeVisible();

    // Should have multiple rows rendered
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test("click sets cursor position", async ({ page }) => {
    // Click on the editor content area
    const editor = page.locator("#editor");
    const box = await editor.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    // Click at a position within the editor
    await page.mouse.click(box.x + 100, box.y + 50);

    // The cursor element should exist and be visible
    const cursor = page.locator("#editor [data-cursor]");
    await expect(cursor).toBeVisible();
  });

  test("type text updates line content", async ({ page }) => {
    // Focus the editor by clicking
    const editor = page.locator("#editor");
    await editor.click();

    // Type some text
    const testText = "hello e2e";
    await page.keyboard.type(testText);

    // Verify the text appears in the rendered rows
    const rowWithText = page.locator("#editor [data-row]", { hasText: testText });
    await expect(rowWithText).toBeVisible();
  });

  test("scenario picker switches content", async ({ page }) => {
    // Find the scenario picker panel (heading says "Demos")
    const picker = page.locator("text=Demos").locator("..");
    await expect(picker).toBeVisible();

    // Click on "Unicode" scenario
    const unicodeButton = picker.locator("button", { hasText: "Unicode" });
    await unicodeButton.click();

    // Wait for Unicode-specific content to appear in the editor.
    // The Unicode fixture contains CJK text like "你好世界" that won't
    // be present in the default "All files" scenario.
    const unicodeLine = page.locator("#editor [data-row]", { hasText: "你好世界" });
    await expect(unicodeLine).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Editor keyboard navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#editor textarea", { timeout: 10_000 });
    // Focus the editor
    await page.locator("#editor").click();
  });

  test("arrow keys move cursor", async ({ page }) => {
    // Get initial cursor position
    const cursor = page.locator("#editor [data-cursor]");
    await expect(cursor).toBeVisible();
    const initialBox = await cursor.boundingBox();
    expect(initialBox).not.toBeNull();
    if (!initialBox) return;

    // Press arrow down and wait for the cursor to move
    await page.keyboard.press("ArrowDown");

    const initialY = initialBox.y;
    await page.waitForFunction(
      (prevY) => {
        const el = document.querySelector("#editor [data-cursor]");
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.y > prevY;
      },
      initialY,
      { timeout: 5_000 },
    );

    // Verify final position
    const afterDownBox = await cursor.boundingBox();
    expect(afterDownBox).not.toBeNull();
    if (!afterDownBox) return;
    expect(afterDownBox.y).toBeGreaterThan(initialBox.y);
  });

  test("typing and backspace work", async ({ page }) => {
    // Type some text
    await page.keyboard.type("abc");

    // Verify text appears
    const rowWithAbc = page.locator("#editor [data-row]", { hasText: "abc" });
    await expect(rowWithAbc).toBeVisible();

    // Press backspace to delete 'c'
    await page.keyboard.press("Backspace");

    // Text should now be "ab"
    const rowWithAb = page.locator("#editor [data-row]", { hasText: /ab[^c]|ab$/ });
    await expect(rowWithAb).toBeVisible();
  });
});
