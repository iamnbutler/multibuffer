/**
 * Tests for the language query registry.
 *
 * Covers:
 * - nodeTypeToCategory — unified lookup across all languages
 * - nodeTypeToCategoryForLanguage — language-specific lookup
 * - getLanguageQuery — language query retrieval
 * - hasLanguageQuery / getRegisteredLanguages — registry queries
 */

import { describe, expect, test } from "bun:test";
import {
  getLanguageQuery,
  getRegisteredLanguages,
  hasLanguageQuery,
  nodeTypeToCategory,
  nodeTypeToCategoryForLanguage,
} from "../../../src/renderer/queries/index.ts";

describe("nodeTypeToCategory — unified lookup", () => {
  test("returns keyword for TypeScript keyword 'const'", () => {
    expect(nodeTypeToCategory("const")).toBe("keyword");
  });

  test("returns string for TypeScript string node", () => {
    expect(nodeTypeToCategory("string")).toBe("string");
  });

  test("returns keyword for Markdown heading 'atx_heading'", () => {
    expect(nodeTypeToCategory("atx_heading")).toBe("keyword");
  });

  test("returns string for YAML 'string_scalar'", () => {
    expect(nodeTypeToCategory("string_scalar")).toBe("string");
  });

  test("returns default for unknown node type", () => {
    expect(nodeTypeToCategory("unknown_node_xyz")).toBe("default");
  });

  test("returns default for empty string", () => {
    expect(nodeTypeToCategory("")).toBe("default");
  });
});

describe("nodeTypeToCategoryForLanguage — language-specific lookup", () => {
  test("returns keyword for 'const' in typescript", () => {
    expect(nodeTypeToCategoryForLanguage("typescript", "const")).toBe("keyword");
  });

  test("returns keyword for 'const' in javascript (same as typescript)", () => {
    expect(nodeTypeToCategoryForLanguage("javascript", "const")).toBe("keyword");
  });

  test("returns keyword for 'atx_heading' in markdown", () => {
    expect(nodeTypeToCategoryForLanguage("markdown", "atx_heading")).toBe("keyword");
  });

  test("returns string for 'string_scalar' in yaml", () => {
    expect(nodeTypeToCategoryForLanguage("yaml", "string_scalar")).toBe("string");
  });

  test("returns default for known node type in unknown language", () => {
    expect(nodeTypeToCategoryForLanguage("rust", "const")).toBe("default");
  });

  test("returns default for unknown node in unknown language", () => {
    expect(nodeTypeToCategoryForLanguage("rust", "unknown_xyz")).toBe("default");
  });
});

describe("getLanguageQuery", () => {
  test("returns query for typescript", () => {
    const query = getLanguageQuery("typescript");
    expect(query).toBeDefined();
    expect(query?.nodeTypeCategory).toBeInstanceOf(Map);
  });

  test("returns query for markdown", () => {
    const query = getLanguageQuery("markdown");
    expect(query).toBeDefined();
    expect(query?.nodeTypeCategory).toBeInstanceOf(Map);
    expect(query?.styledParents).toBeInstanceOf(Set);
    expect(query?.skipChildren).toBeInstanceOf(Set);
  });

  test("returns query for yaml", () => {
    const query = getLanguageQuery("yaml");
    expect(query).toBeDefined();
    expect(query?.nodeTypeCategory).toBeInstanceOf(Map);
  });

  test("returns undefined for unknown language", () => {
    expect(getLanguageQuery("rust")).toBeUndefined();
  });
});

describe("hasLanguageQuery", () => {
  test("returns true for typescript", () => {
    expect(hasLanguageQuery("typescript")).toBe(true);
  });

  test("returns true for javascript", () => {
    expect(hasLanguageQuery("javascript")).toBe(true);
  });

  test("returns true for markdown", () => {
    expect(hasLanguageQuery("markdown")).toBe(true);
  });

  test("returns true for yaml", () => {
    expect(hasLanguageQuery("yaml")).toBe(true);
  });

  test("returns true for yml (alias for yaml)", () => {
    expect(hasLanguageQuery("yml")).toBe(true);
  });

  test("returns false for unknown language", () => {
    expect(hasLanguageQuery("rust")).toBe(false);
  });
});

describe("getRegisteredLanguages", () => {
  test("returns array of language identifiers", () => {
    const languages = getRegisteredLanguages();
    expect(Array.isArray(languages)).toBe(true);
  });

  test("includes typescript", () => {
    expect(getRegisteredLanguages()).toContain("typescript");
  });

  test("includes markdown", () => {
    expect(getRegisteredLanguages()).toContain("markdown");
  });

  test("includes yaml", () => {
    expect(getRegisteredLanguages()).toContain("yaml");
  });
});
