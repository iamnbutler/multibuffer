/**
 * Tests for TypeScript/JavaScript language queries.
 */

import { describe, expect, test } from "bun:test";
import { typescriptQuery } from "../../../src/renderer/queries/typescript.ts";

describe("typescriptQuery — nodeTypeCategory", () => {
  const { nodeTypeCategory } = typescriptQuery;

  describe("keywords", () => {
    const keywords = [
      "const", "let", "var", "function", "return", "if", "else",
      "for", "while", "class", "extends", "implements", "interface",
      "import", "export", "async", "await", "typeof", "type",
    ];

    for (const keyword of keywords) {
      test(`'${keyword}' → keyword`, () => {
        expect(nodeTypeCategory.get(keyword)).toBe("keyword");
      });
    }
  });

  describe("strings", () => {
    test("string → string", () => {
      expect(nodeTypeCategory.get("string")).toBe("string");
    });

    test("string_fragment → string", () => {
      expect(nodeTypeCategory.get("string_fragment")).toBe("string");
    });

    test("template_string → string", () => {
      expect(nodeTypeCategory.get("template_string")).toBe("string");
    });

    test("regex → string", () => {
      expect(nodeTypeCategory.get("regex")).toBe("string");
    });
  });

  describe("numbers", () => {
    test("number → number", () => {
      expect(nodeTypeCategory.get("number")).toBe("number");
    });
  });

  describe("comments", () => {
    test("comment → comment", () => {
      expect(nodeTypeCategory.get("comment")).toBe("comment");
    });

    test("line_comment → comment", () => {
      expect(nodeTypeCategory.get("line_comment")).toBe("comment");
    });

    test("block_comment → comment", () => {
      expect(nodeTypeCategory.get("block_comment")).toBe("comment");
    });
  });

  describe("types", () => {
    test("type_identifier → type", () => {
      expect(nodeTypeCategory.get("type_identifier")).toBe("type");
    });

    test("predefined_type → type", () => {
      expect(nodeTypeCategory.get("predefined_type")).toBe("type");
    });
  });

  describe("operators", () => {
    const operators = [
      "==", "===", "!=", "!==", ">", "<", ">=", "<=",
      "+", "-", "*", "/", "=>", "??", "...",
    ];

    for (const op of operators) {
      test(`'${op}' → operator`, () => {
        expect(nodeTypeCategory.get(op)).toBe("operator");
      });
    }
  });

  describe("punctuation", () => {
    const punctuation = ["(", ")", "[", "]", "{", ";", ",", "."];

    for (const p of punctuation) {
      test(`'${p}' → punctuation`, () => {
        expect(nodeTypeCategory.get(p)).toBe("punctuation");
      });
    }
  });

  describe("constants", () => {
    test("true → constant", () => {
      expect(nodeTypeCategory.get("true")).toBe("constant");
    });

    test("false → constant", () => {
      expect(nodeTypeCategory.get("false")).toBe("constant");
    });

    test("null → constant", () => {
      expect(nodeTypeCategory.get("null")).toBe("constant");
    });
  });

  describe("built-in variables", () => {
    test("this → variable_builtin", () => {
      expect(nodeTypeCategory.get("this")).toBe("variable_builtin");
    });

    test("super → variable_builtin", () => {
      expect(nodeTypeCategory.get("super")).toBe("variable_builtin");
    });
  });
});

describe("typescriptQuery — structure", () => {
  test("does not have styledParents (TypeScript doesn't need it)", () => {
    expect(typescriptQuery.styledParents).toBeUndefined();
  });

  test("does not have skipChildren (TypeScript doesn't need it)", () => {
    expect(typescriptQuery.skipChildren).toBeUndefined();
  });
});
