/**
 * Tests for YAML language queries.
 */

import { describe, expect, test } from "bun:test";
import { yamlQuery } from "../../../src/renderer/queries/yaml.ts";

describe("yamlQuery — nodeTypeCategory", () => {
  const { nodeTypeCategory } = yamlQuery;

  describe("strings", () => {
    test("string_scalar → string", () => {
      expect(nodeTypeCategory.get("string_scalar")).toBe("string");
    });

    test("double_quote_scalar → string", () => {
      expect(nodeTypeCategory.get("double_quote_scalar")).toBe("string");
    });

    test("single_quote_scalar → string", () => {
      expect(nodeTypeCategory.get("single_quote_scalar")).toBe("string");
    });

    test("block_scalar → string", () => {
      expect(nodeTypeCategory.get("block_scalar")).toBe("string");
    });
  });

  describe("numbers", () => {
    test("integer_scalar → number", () => {
      expect(nodeTypeCategory.get("integer_scalar")).toBe("number");
    });

    test("float_scalar → number", () => {
      expect(nodeTypeCategory.get("float_scalar")).toBe("number");
    });
  });

  describe("constants", () => {
    test("boolean_scalar → constant", () => {
      expect(nodeTypeCategory.get("boolean_scalar")).toBe("constant");
    });

    test("null_scalar → constant", () => {
      expect(nodeTypeCategory.get("null_scalar")).toBe("constant");
    });
  });

  describe("types (anchors, aliases, tags)", () => {
    test("anchor_name → type", () => {
      expect(nodeTypeCategory.get("anchor_name")).toBe("type");
    });

    test("alias_name → type", () => {
      expect(nodeTypeCategory.get("alias_name")).toBe("type");
    });

    test("tag → type", () => {
      expect(nodeTypeCategory.get("tag")).toBe("type");
    });
  });

  describe("operators", () => {
    test("escape_sequence → operator", () => {
      expect(nodeTypeCategory.get("escape_sequence")).toBe("operator");
    });
  });
});

describe("yamlQuery — structure", () => {
  test("does not have styledParents (YAML doesn't need it)", () => {
    expect(yamlQuery.styledParents).toBeUndefined();
  });

  test("does not have skipChildren (YAML doesn't need it)", () => {
    expect(yamlQuery.skipChildren).toBeUndefined();
  });
});
