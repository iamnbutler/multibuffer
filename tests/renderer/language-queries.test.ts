/**
 * Tests for language query registrations.
 *
 * Verifies that all registered language queries have valid mappings
 * and that the registry functions work correctly with the expanded
 * language set.
 */

import { describe, expect, test } from "bun:test";
import {
  bashQuery,
  cQuery,
  cssQuery,
  getLanguageQuery,
  getRegisteredLanguages,
  goQuery,
  hasLanguageQuery,
  htmlQuery,
  jsonQuery,
  markdownQuery,
  nodeTypeToCategory,
  nodeTypeToCategoryForLanguage,
  pythonQuery,
  rubyQuery,
  rustQuery,
  tomlQuery,
  typescriptQuery,
  yamlQuery,
} from "../../src/renderer/queries/index.ts";

describe("language query registry", () => {
  test("all expected languages are registered", () => {
    const expected = [
      "typescript", "javascript", "tsx", "jsx",
      "markdown",
      "yaml", "yml",
      "rust", "go", "python", "ruby",
      "html", "css", "json", "toml",
      "bash",
      "c", "cpp",
    ];
    for (const lang of expected) {
      expect(hasLanguageQuery(lang)).toBe(true);
    }
  });

  test("getRegisteredLanguages returns all registered languages", () => {
    const languages = getRegisteredLanguages();
    expect(languages.length).toBeGreaterThanOrEqual(18);
    expect(languages).toContain("rust");
    expect(languages).toContain("python");
    expect(languages).toContain("go");
  });

  test("getLanguageQuery returns query for registered languages", () => {
    expect(getLanguageQuery("rust")).toBeDefined();
    expect(getLanguageQuery("go")).toBeDefined();
    expect(getLanguageQuery("python")).toBeDefined();
  });

  test("getLanguageQuery returns undefined for unregistered language", () => {
    expect(getLanguageQuery("brainfuck")).toBeUndefined();
  });
});

describe("nodeTypeToCategory with new languages", () => {
  test("resolves Rust node types", () => {
    expect(nodeTypeToCategory("fn")).toBe("keyword");
    expect(nodeTypeToCategory("line_comment")).toBe("comment");
    expect(nodeTypeToCategory("boolean_literal")).toBe("constant");
    expect(nodeTypeToCategory("field_identifier")).toBe("property");
    expect(nodeTypeToCategory("lifetime")).toBe("type");
  });

  test("resolves Go node types", () => {
    expect(nodeTypeToCategory("func")).toBe("keyword");
    expect(nodeTypeToCategory("package")).toBe("keyword");
    expect(nodeTypeToCategory("int_literal")).toBe("number");
    expect(nodeTypeToCategory("nil")).toBe("constant");
    expect(nodeTypeToCategory("iota")).toBe("constant");
  });

  test("resolves Python node types", () => {
    expect(nodeTypeToCategory("def")).toBe("keyword");
    expect(nodeTypeToCategory("elif")).toBe("keyword");
    expect(nodeTypeToCategory("integer")).toBe("number");
    expect(nodeTypeToCategory("None")).toBe("constant");
  });

  test("resolves Ruby node types", () => {
    expect(nodeTypeToCategory("end")).toBe("keyword");
    expect(nodeTypeToCategory("module")).toBe("keyword");
    expect(nodeTypeToCategory("simple_symbol")).toBe("constant");
  });

  test("resolves HTML node types", () => {
    expect(nodeTypeToCategory("tag_name")).toBe("keyword");
    expect(nodeTypeToCategory("attribute_name")).toBe("property");
    expect(nodeTypeToCategory("attribute_value")).toBe("string");
  });

  test("resolves CSS node types", () => {
    expect(nodeTypeToCategory("property_name")).toBe("property");
    expect(nodeTypeToCategory("class_name")).toBe("type");
    expect(nodeTypeToCategory("color_value")).toBe("number");
  });

  test("resolves JSON node types", () => {
    // JSON shares some node types with TS (string, number, true, false, null)
    // The combined map picks whichever was registered last
    expect(nodeTypeToCategory("string")).not.toBe("default");
    expect(nodeTypeToCategory("number")).not.toBe("default");
  });

  test("resolves TOML node types", () => {
    expect(nodeTypeToCategory("bare_key")).toBe("property");
    expect(nodeTypeToCategory("basic_string")).toBe("string");
    expect(nodeTypeToCategory("offset_date_time")).toBe("number");
  });

  test("resolves Bash node types", () => {
    expect(nodeTypeToCategory("command_name")).toBe("function");
    expect(nodeTypeToCategory("variable_name")).toBe("property");
    expect(nodeTypeToCategory("special_variable_name")).toBe("variable_builtin");
  });

  test("resolves C/C++ node types", () => {
    expect(nodeTypeToCategory("typedef")).toBe("keyword");
    expect(nodeTypeToCategory("primitive_type")).toBe("type");
    expect(nodeTypeToCategory("number_literal")).toBe("number");
    expect(nodeTypeToCategory("nullptr")).toBe("constant");
  });

  test("returns default for unknown node types", () => {
    expect(nodeTypeToCategory("nonexistent_node_type_xyz")).toBe("default");
  });
});

describe("nodeTypeToCategoryForLanguage", () => {
  test("resolves within specific language only", () => {
    // "fn" is a Rust keyword, not a Go keyword
    expect(nodeTypeToCategoryForLanguage("rust", "fn")).toBe("keyword");
    expect(nodeTypeToCategoryForLanguage("go", "fn")).toBe("default");
  });

  test("returns default for unknown language", () => {
    expect(nodeTypeToCategoryForLanguage("haskell", "let")).toBe("default");
  });
});

describe("individual language queries", () => {
  const queries = [
    { name: "rust", query: rustQuery },
    { name: "go", query: goQuery },
    { name: "python", query: pythonQuery },
    { name: "ruby", query: rubyQuery },
    { name: "html", query: htmlQuery },
    { name: "css", query: cssQuery },
    { name: "json", query: jsonQuery },
    { name: "toml", query: tomlQuery },
    { name: "bash", query: bashQuery },
    { name: "c", query: cQuery },
  ];

  for (const { name, query } of queries) {
    test(`${name} query has non-empty nodeTypeCategory`, () => {
      expect(query.nodeTypeCategory.size).toBeGreaterThan(0);
    });

    test(`${name} query maps to valid categories`, () => {
      const validCategories = new Set([
        "keyword", "string", "number", "comment", "type",
        "function", "property", "operator", "punctuation",
        "constant", "variable_builtin", "default",
      ]);
      for (const [, category] of query.nodeTypeCategory) {
        expect(validCategories.has(category)).toBe(true);
      }
    });
  }

  test("markdown query has styledParents", () => {
    expect(markdownQuery.styledParents).toBeDefined();
    expect(markdownQuery.styledParents?.size).toBeGreaterThan(0);
  });

  test("markdown query has skipChildren", () => {
    expect(markdownQuery.skipChildren).toBeDefined();
    expect(markdownQuery.skipChildren?.size).toBeGreaterThan(0);
  });
});

describe("theme integration", () => {
  test("colorForNodeType returns CSS var() for all categories", () => {
    // Import colorForNodeType to test theme integration
    const { colorForNodeType } = require("../../src/renderer/theme.ts");

    // Pick representative node types from different languages
    const nodeTypes = [
      "fn",           // Rust keyword
      "func",         // Go keyword
      "def",          // Python keyword
      "tag_name",     // HTML keyword
      "property_name", // CSS property
      "bare_key",     // TOML property
      "command_name", // Bash function
    ];

    for (const nodeType of nodeTypes) {
      const color = colorForNodeType(nodeType);
      expect(color).toMatch(/^var\(--syntax-/);
    }
  });
});
