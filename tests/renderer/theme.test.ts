/**
 * Tests for the Theme API.
 *
 * DOM rendering aspects (CSS variable application) require a browser environment
 * and are tested via Playwright e2e tests. These tests verify the theme data
 * model, conversion logic, and bundled themes.
 */

import { describe, expect, test } from "bun:test";
import {
  GRUVBOX_DARK_THEME,
  GRUVBOX_THEME,
  LIGHT_THEME,
  THEME_CSS_VARIABLES,
  themeToVars,
} from "../../src/renderer/theme.ts";
import type { Theme } from "../../src/renderer/types.ts";

// All keys present in the Theme interface and THEME_CSS_VARIABLES
const THEME_KEYS: Array<keyof Theme> = [
  "cursor",
  "selection",
  "gutter",
  "headerBg",
  "headerBorder",
  "headerText",
  "lineBg",
  "syntaxKeyword",
  "syntaxString",
  "syntaxNumber",
  "syntaxComment",
  "syntaxType",
  "syntaxFunction",
  "syntaxProperty",
  "syntaxOperator",
  "syntaxPunctuation",
  "syntaxConstant",
  "syntaxVariableBuiltin",
  "syntaxDefault",
];

describe("THEME_CSS_VARIABLES", () => {
  test("has an entry for every Theme key", () => {
    for (const key of THEME_KEYS) {
      expect(THEME_CSS_VARIABLES[key]).toBeDefined();
      expect(typeof THEME_CSS_VARIABLES[key]).toBe("string");
    }
  });

  test("all values start with '--'", () => {
    for (const [, cssVar] of Object.entries(THEME_CSS_VARIABLES)) {
      expect(cssVar.startsWith("--")).toBe(true);
    }
  });
});

describe("themeToVars", () => {
  test("converts full theme to CSS variable map", () => {
    const vars = themeToVars(GRUVBOX_DARK_THEME);
    expect(Object.keys(vars)).toHaveLength(THEME_KEYS.length);
    for (const key of THEME_KEYS) {
      const cssVar = THEME_CSS_VARIABLES[key];
      expect(vars[cssVar]).toBeDefined();
    }
  });

  test("maps cursor key to --editor-cursor", () => {
    const vars = themeToVars({ cursor: "#ff0000" });
    expect(vars["--editor-cursor"]).toBe("#ff0000");
  });

  test("maps syntaxKeyword to --syntax-keyword", () => {
    const vars = themeToVars({ syntaxKeyword: "#d73a49" });
    expect(vars["--syntax-keyword"]).toBe("#d73a49");
  });

  test("partial theme only converts provided keys", () => {
    const vars = themeToVars({ cursor: "red", gutter: "blue" });
    expect(Object.keys(vars)).toHaveLength(2);
    expect(vars["--editor-cursor"]).toBe("red");
    expect(vars["--editor-gutter"]).toBe("blue");
    expect(vars["--editor-selection"]).toBeUndefined();
  });

  test("empty theme produces empty map", () => {
    const vars = themeToVars({});
    expect(Object.keys(vars)).toHaveLength(0);
  });

  test("all 19 keys map to distinct CSS variables", () => {
    const vars = themeToVars(GRUVBOX_DARK_THEME);
    const cssVarValues = Object.keys(vars);
    const uniqueVars = new Set(cssVarValues);
    expect(uniqueVars.size).toBe(cssVarValues.length);
  });
});

describe("GRUVBOX_DARK_THEME", () => {
  test("covers all Theme keys", () => {
    for (const key of THEME_KEYS) {
      expect(GRUVBOX_DARK_THEME[key]).toBeDefined();
      expect(typeof GRUVBOX_DARK_THEME[key]).toBe("string");
      expect(GRUVBOX_DARK_THEME[key].length).toBeGreaterThan(0);
    }
  });

  test("has same cursor value as GRUVBOX_THEME", () => {
    const vars = themeToVars(GRUVBOX_DARK_THEME);
    expect(vars["--editor-cursor"]).toBe(GRUVBOX_THEME["--editor-cursor"]);
  });

  test("has same selection value as GRUVBOX_THEME", () => {
    const vars = themeToVars(GRUVBOX_DARK_THEME);
    expect(vars["--editor-selection"]).toBe(GRUVBOX_THEME["--editor-selection"]);
  });

  test("has same syntax keyword value as GRUVBOX_THEME", () => {
    const vars = themeToVars(GRUVBOX_DARK_THEME);
    expect(vars["--syntax-keyword"]).toBe(GRUVBOX_THEME["--syntax-keyword"]);
  });

  test("is a complete Theme (all 19 keys present)", () => {
    const vars = themeToVars(GRUVBOX_DARK_THEME);
    expect(Object.keys(vars)).toHaveLength(19);
  });
});

describe("LIGHT_THEME", () => {
  test("covers all Theme keys", () => {
    for (const key of THEME_KEYS) {
      expect(LIGHT_THEME[key]).toBeDefined();
      expect(typeof LIGHT_THEME[key]).toBe("string");
      expect(LIGHT_THEME[key].length).toBeGreaterThan(0);
    }
  });

  test("is a complete Theme (all 19 keys present)", () => {
    const vars = themeToVars(LIGHT_THEME);
    expect(Object.keys(vars)).toHaveLength(19);
  });

  test("cursor is a dark color (light background context)", () => {
    // Light theme cursors should be dark
    const cursor = LIGHT_THEME.cursor;
    expect(cursor).toBe("#24292e");
  });

  test("differs from GRUVBOX_DARK_THEME in at least header and cursor colors", () => {
    expect(LIGHT_THEME.cursor).not.toBe(GRUVBOX_DARK_THEME.cursor);
    expect(LIGHT_THEME.headerBg).not.toBe(GRUVBOX_DARK_THEME.headerBg);
  });
});

describe("Theme type contract", () => {
  test("full Theme can be constructed", () => {
    // Compile-time check: if this compiles, the type contract is correct
    const theme: Theme = {
      cursor: "#000",
      selection: "rgba(0,0,255,0.2)",
      gutter: "#888",
      headerBg: "#eee",
      headerBorder: "#ccc",
      headerText: "#666",
      lineBg: "transparent",
      syntaxKeyword: "#d73a49",
      syntaxString: "#032f62",
      syntaxNumber: "#005cc5",
      syntaxComment: "#6a737d",
      syntaxType: "#6f42c1",
      syntaxFunction: "#6f42c1",
      syntaxProperty: "#005cc5",
      syntaxOperator: "#d73a49",
      syntaxPunctuation: "#24292e",
      syntaxConstant: "#005cc5",
      syntaxVariableBuiltin: "#005cc5",
      syntaxDefault: "#24292e",
    };
    expect(Object.keys(theme)).toHaveLength(19);
  });

  test("Partial<Theme> can be constructed with a subset of keys", () => {
    const partial: Partial<Theme> = { cursor: "red", gutter: "blue" };
    expect(partial.cursor).toBe("red");
    expect(partial.syntaxKeyword).toBeUndefined();
  });
});
