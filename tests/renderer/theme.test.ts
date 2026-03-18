/**
 * Tests for colorForNodeType — maps tree-sitter node types to CSS var() expressions.
 *
 * Also covers the exported THEME_CSS_VARIABLES and GRUVBOX_THEME constants.
 * The internal nodeTypeToCategory function is exercised indirectly via colorForNodeType.
 */

import { describe, expect, test } from "bun:test";
import {
  colorForNodeType,
  GRUVBOX_THEME,
  THEME_CSS_VARIABLES,
} from "../../src/renderer/theme.ts";


describe("colorForNodeType — return value format", () => {
  test("returns a CSS var() expression", () => {
    const color = colorForNodeType("const");
    expect(color.startsWith("var(")).toBe(true);
    expect(color.endsWith(")")).toBe(true);
  });

  test("fallback is a hex color", () => {
    // Format: var(--syntax-keyword, #fb4934)
    const color = colorForNodeType("const");
    expect(color).toMatch(/var\(--[\w-]+, #[0-9a-fA-F]{6}\)/);
  });
});


describe("colorForNodeType — TypeScript / JavaScript keyword nodes", () => {
  test("const → --syntax-keyword", () => {
    expect(colorForNodeType("const")).toContain("--syntax-keyword");
  });

  test("let → --syntax-keyword", () => {
    expect(colorForNodeType("let")).toContain("--syntax-keyword");
  });

  test("function → --syntax-keyword", () => {
    expect(colorForNodeType("function")).toContain("--syntax-keyword");
  });

  test("return → --syntax-keyword", () => {
    expect(colorForNodeType("return")).toContain("--syntax-keyword");
  });

  test("class → --syntax-keyword", () => {
    expect(colorForNodeType("class")).toContain("--syntax-keyword");
  });

  test("import → --syntax-keyword", () => {
    expect(colorForNodeType("import")).toContain("--syntax-keyword");
  });

  test("export → --syntax-keyword", () => {
    expect(colorForNodeType("export")).toContain("--syntax-keyword");
  });

  test("async → --syntax-keyword", () => {
    expect(colorForNodeType("async")).toContain("--syntax-keyword");
  });

  test("await → --syntax-keyword", () => {
    expect(colorForNodeType("await")).toContain("--syntax-keyword");
  });

  test("typeof → --syntax-keyword", () => {
    expect(colorForNodeType("typeof")).toContain("--syntax-keyword");
  });

  test("type → --syntax-keyword", () => {
    expect(colorForNodeType("type")).toContain("--syntax-keyword");
  });

  test("interface → --syntax-keyword", () => {
    expect(colorForNodeType("interface")).toContain("--syntax-keyword");
  });
});


describe("colorForNodeType — string nodes", () => {
  test("string → --syntax-string", () => {
    expect(colorForNodeType("string")).toContain("--syntax-string");
  });

  test("string_fragment → --syntax-string", () => {
    expect(colorForNodeType("string_fragment")).toContain("--syntax-string");
  });

  test("template_string → --syntax-string", () => {
    expect(colorForNodeType("template_string")).toContain("--syntax-string");
  });

  test("regex → --syntax-string", () => {
    expect(colorForNodeType("regex")).toContain("--syntax-string");
  });

  test("double-quote delimiter → --syntax-string", () => {
    expect(colorForNodeType('"')).toContain("--syntax-string");
  });

  test("backtick delimiter → --syntax-string", () => {
    expect(colorForNodeType("`")).toContain("--syntax-string");
  });
});


describe("colorForNodeType — number / comment / type nodes", () => {
  test("number → --syntax-number", () => {
    expect(colorForNodeType("number")).toContain("--syntax-number");
  });

  test("comment → --syntax-comment", () => {
    expect(colorForNodeType("comment")).toContain("--syntax-comment");
  });

  test("line_comment → --syntax-comment", () => {
    expect(colorForNodeType("line_comment")).toContain("--syntax-comment");
  });

  test("block_comment → --syntax-comment", () => {
    expect(colorForNodeType("block_comment")).toContain("--syntax-comment");
  });

  test("type_identifier → --syntax-type", () => {
    expect(colorForNodeType("type_identifier")).toContain("--syntax-type");
  });

  test("predefined_type → --syntax-type", () => {
    expect(colorForNodeType("predefined_type")).toContain("--syntax-type");
  });
});


describe("colorForNodeType — function / property nodes", () => {
  test("function_declaration → --syntax-function", () => {
    expect(colorForNodeType("function_declaration")).toContain("--syntax-function");
  });

  test("method_definition → --syntax-function", () => {
    expect(colorForNodeType("method_definition")).toContain("--syntax-function");
  });

  test("property_identifier → --syntax-property", () => {
    expect(colorForNodeType("property_identifier")).toContain("--syntax-property");
  });

  test("shorthand_property_identifier → --syntax-property", () => {
    expect(colorForNodeType("shorthand_property_identifier")).toContain("--syntax-property");
  });
});


describe("colorForNodeType — operators", () => {
  test("'==' → --syntax-operator", () => {
    expect(colorForNodeType("==")).toContain("--syntax-operator");
  });

  test("'===' → --syntax-operator", () => {
    expect(colorForNodeType("===")).toContain("--syntax-operator");
  });

  test("'+' → --syntax-operator", () => {
    expect(colorForNodeType("+")).toContain("--syntax-operator");
  });

  test("'=>' → --syntax-operator", () => {
    expect(colorForNodeType("=>")).toContain("--syntax-operator");
  });

  test("'??' → --syntax-operator", () => {
    expect(colorForNodeType("??")).toContain("--syntax-operator");
  });

  test("'...' → --syntax-operator", () => {
    expect(colorForNodeType("...")).toContain("--syntax-operator");
  });
});


describe("colorForNodeType — punctuation", () => {
  test("'(' → --syntax-punctuation", () => {
    expect(colorForNodeType("(")).toContain("--syntax-punctuation");
  });

  test("')' → --syntax-punctuation", () => {
    expect(colorForNodeType(")")).toContain("--syntax-punctuation");
  });

  test("';' → --syntax-punctuation", () => {
    expect(colorForNodeType(";")).toContain("--syntax-punctuation");
  });

  test("',' → --syntax-punctuation", () => {
    expect(colorForNodeType(",")).toContain("--syntax-punctuation");
  });

  test("'.' → --syntax-punctuation", () => {
    expect(colorForNodeType(".")).toContain("--syntax-punctuation");
  });
});


describe("colorForNodeType — constants and builtins", () => {
  test("true → --syntax-constant", () => {
    expect(colorForNodeType("true")).toContain("--syntax-constant");
  });

  test("false → --syntax-constant", () => {
    expect(colorForNodeType("false")).toContain("--syntax-constant");
  });

  test("null → --syntax-constant", () => {
    expect(colorForNodeType("null")).toContain("--syntax-constant");
  });

  test("undefined → --syntax-constant", () => {
    expect(colorForNodeType("undefined")).toContain("--syntax-constant");
  });

  test("this → --syntax-variable-builtin", () => {
    expect(colorForNodeType("this")).toContain("--syntax-variable-builtin");
  });

  test("super → --syntax-variable-builtin", () => {
    expect(colorForNodeType("super")).toContain("--syntax-variable-builtin");
  });
});


describe("colorForNodeType — Markdown node types", () => {
  test("atx_heading → --syntax-keyword (title.markup)", () => {
    expect(colorForNodeType("atx_heading")).toContain("--syntax-keyword");
  });

  test("atx_h1_marker → --syntax-keyword", () => {
    expect(colorForNodeType("atx_h1_marker")).toContain("--syntax-keyword");
  });

  test("code_span → --syntax-string (text.literal.markup)", () => {
    expect(colorForNodeType("code_span")).toContain("--syntax-string");
  });

  test("fenced_code_block_delimiter → --syntax-comment (punctuation.embedded)", () => {
    expect(colorForNodeType("fenced_code_block_delimiter")).toContain("--syntax-comment");
  });

  test("link_destination → --syntax-property (link_uri.markup)", () => {
    expect(colorForNodeType("link_destination")).toContain("--syntax-property");
  });

  test("emphasis → --syntax-type (emphasis.markup)", () => {
    expect(colorForNodeType("emphasis")).toContain("--syntax-type");
  });

  test("strong_emphasis → --syntax-constant (emphasis.strong.markup)", () => {
    expect(colorForNodeType("strong_emphasis")).toContain("--syntax-constant");
  });

  test("strikethrough → --syntax-comment", () => {
    expect(colorForNodeType("strikethrough")).toContain("--syntax-comment");
  });

  test("list_marker_minus → --syntax-operator (punctuation.list_marker.markup)", () => {
    expect(colorForNodeType("list_marker_minus")).toContain("--syntax-operator");
  });

  test("task_list_marker_checked → --syntax-operator", () => {
    expect(colorForNodeType("task_list_marker_checked")).toContain("--syntax-operator");
  });
});


describe("colorForNodeType — YAML node types", () => {
  test("string_scalar → --syntax-string", () => {
    expect(colorForNodeType("string_scalar")).toContain("--syntax-string");
  });

  test("integer_scalar → --syntax-number", () => {
    expect(colorForNodeType("integer_scalar")).toContain("--syntax-number");
  });

  test("boolean_scalar → --syntax-constant", () => {
    expect(colorForNodeType("boolean_scalar")).toContain("--syntax-constant");
  });

  test("null_scalar → --syntax-constant", () => {
    expect(colorForNodeType("null_scalar")).toContain("--syntax-constant");
  });

  test("anchor_name → --syntax-type", () => {
    expect(colorForNodeType("anchor_name")).toContain("--syntax-type");
  });
});


describe("colorForNodeType — unknown node type falls back to default", () => {
  test("totally unknown node → --syntax-default", () => {
    expect(colorForNodeType("xyzzy_unknown_node_type_12345")).toContain("--syntax-default");
  });

  test("empty string → --syntax-default", () => {
    expect(colorForNodeType("")).toContain("--syntax-default");
  });
});


describe("THEME_CSS_VARIABLES", () => {
  test("editor chrome variables are correctly named", () => {
    expect(THEME_CSS_VARIABLES.cursor).toBe("--editor-cursor");
    expect(THEME_CSS_VARIABLES.selection).toBe("--editor-selection");
    expect(THEME_CSS_VARIABLES.gutter).toBe("--editor-gutter");
    expect(THEME_CSS_VARIABLES.headerBg).toBe("--editor-header-bg");
    expect(THEME_CSS_VARIABLES.headerBorder).toBe("--editor-header-border");
    expect(THEME_CSS_VARIABLES.headerText).toBe("--editor-header-text");
    expect(THEME_CSS_VARIABLES.lineBg).toBe("--editor-line-bg");
  });

  test("syntax variables are correctly named", () => {
    expect(THEME_CSS_VARIABLES.syntaxKeyword).toBe("--syntax-keyword");
    expect(THEME_CSS_VARIABLES.syntaxString).toBe("--syntax-string");
    expect(THEME_CSS_VARIABLES.syntaxNumber).toBe("--syntax-number");
    expect(THEME_CSS_VARIABLES.syntaxComment).toBe("--syntax-comment");
    expect(THEME_CSS_VARIABLES.syntaxType).toBe("--syntax-type");
    expect(THEME_CSS_VARIABLES.syntaxFunction).toBe("--syntax-function");
    expect(THEME_CSS_VARIABLES.syntaxProperty).toBe("--syntax-property");
    expect(THEME_CSS_VARIABLES.syntaxOperator).toBe("--syntax-operator");
    expect(THEME_CSS_VARIABLES.syntaxPunctuation).toBe("--syntax-punctuation");
    expect(THEME_CSS_VARIABLES.syntaxConstant).toBe("--syntax-constant");
    expect(THEME_CSS_VARIABLES.syntaxVariableBuiltin).toBe("--syntax-variable-builtin");
    expect(THEME_CSS_VARIABLES.syntaxDefault).toBe("--syntax-default");
  });
});


describe("GRUVBOX_THEME", () => {
  test("editor chrome entries are defined", () => {
    expect(GRUVBOX_THEME["--editor-cursor"]).toBeTruthy();
    expect(GRUVBOX_THEME["--editor-selection"]).toBeTruthy();
    expect(GRUVBOX_THEME["--editor-gutter"]).toBeTruthy();
    expect(GRUVBOX_THEME["--editor-header-bg"]).toBeTruthy();
  });

  test("syntax entries are defined", () => {
    expect(GRUVBOX_THEME["--syntax-keyword"]).toBeTruthy();
    expect(GRUVBOX_THEME["--syntax-string"]).toBeTruthy();
    expect(GRUVBOX_THEME["--syntax-number"]).toBeTruthy();
    expect(GRUVBOX_THEME["--syntax-comment"]).toBeTruthy();
    expect(GRUVBOX_THEME["--syntax-default"]).toBeTruthy();
  });

  test("all editor chrome THEME_CSS_VARIABLES keys have a GRUVBOX_THEME entry", () => {
    const chromVars = [
      THEME_CSS_VARIABLES.cursor,
      THEME_CSS_VARIABLES.selection,
      THEME_CSS_VARIABLES.gutter,
      THEME_CSS_VARIABLES.headerBg,
      THEME_CSS_VARIABLES.headerBorder,
      THEME_CSS_VARIABLES.headerText,
    ];
    for (const cssVar of chromVars) {
      // biome-ignore lint/plugin/no-type-assertion: expect: indexing const object with string key in test assertion
      expect((GRUVBOX_THEME as Record<string, string>)[cssVar]).toBeTruthy();
    }
  });
});
