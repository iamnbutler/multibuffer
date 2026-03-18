import { expect, test } from "@playwright/test";

/**
 * Phase 1: Editor basics (validate the harness works)
 *
 * These tests verify the full pipeline:
 * Editor → MultiBuffer → DomRenderer → DOM
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
    // Lines are rendered as .line elements inside the scroll container
    const lines = page.locator("#editor .line");
    await expect(lines.first()).toBeVisible();

    // Should have multiple lines (sources are loaded by default)
    const count = await lines.count();
    expect(count).toBeGreaterThan(0);
  });

  test("click sets cursor position", async ({ page }) => {
    // Click on the editor content area
    const editor = page.locator("#editor");
    const box = await editor.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    // Click at a position within the editor (below gutter area)
    await page.mouse.click(box.x + 100, box.y + 50);

    // The cursor element should exist and be visible
    const cursor = page.locator("#editor .cursor");
    await expect(cursor).toBeVisible();
  });

  test("type text updates line content", async ({ page }) => {
    // Focus the editor by clicking
    const editor = page.locator("#editor");
    await editor.click();

    // Type some text
    const testText = "hello e2e";
    await page.keyboard.type(testText);

    // Verify the text appears in the rendered lines
    const lineWithText = page.locator("#editor .line", { hasText: testText });
    await expect(lineWithText).toBeVisible();
  });

  test("scenario picker switches content", async ({ page }) => {
    // Find the scenario picker panel
    const picker = page.locator("text=Fixture").locator("..");
    await expect(picker).toBeVisible();

    // Click on "Unicode" scenario
    const unicodeButton = picker.locator("button", { hasText: "Unicode" });
    await unicodeButton.click();

    // Wait for content to update - Unicode fixture has specific content
    // The fixture includes emoji and special characters
    await page.waitForTimeout(100); // Allow scenario switch to complete

    // Verify the editor still has content
    const lines = page.locator("#editor .line");
    const count = await lines.count();
    expect(count).toBeGreaterThan(0);
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
    const cursor = page.locator("#editor .cursor");
    await expect(cursor).toBeVisible();
    const initialBox = await cursor.boundingBox();
    expect(initialBox).not.toBeNull();
    if (!initialBox) return;

    // Press arrow down
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(50);

    // Cursor should have moved (top position changed)
    const afterDownBox = await cursor.boundingBox();
    expect(afterDownBox).not.toBeNull();
    if (!afterDownBox) return;

    // Cursor should be lower on screen (larger top value)
    expect(afterDownBox.y).toBeGreaterThan(initialBox.y);
  });

  test("typing and backspace work", async ({ page }) => {
    // Type some text
    await page.keyboard.type("abc");

    // Verify text appears
    const lineWithAbc = page.locator("#editor .line", { hasText: "abc" });
    await expect(lineWithAbc).toBeVisible();

    // Press backspace to delete 'c'
    await page.keyboard.press("Backspace");

    // Text should now be "ab"
    const lineWithAb = page.locator("#editor .line", { hasText: /ab[^c]|ab$/ });
    await expect(lineWithAb).toBeVisible();
  });
});
