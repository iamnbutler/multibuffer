/**
 * Tests for Markdown language queries.
 */

import { describe, expect, test } from "bun:test";
import { markdownQuery } from "../../../src/renderer/queries/markdown.ts";

describe("markdownQuery — nodeTypeCategory", () => {
  const { nodeTypeCategory } = markdownQuery;

  describe("headings", () => {
    test("atx_heading → keyword", () => {
      expect(nodeTypeCategory.get("atx_heading")).toBe("keyword");
    });

    test("setext_heading → keyword", () => {
      expect(nodeTypeCategory.get("setext_heading")).toBe("keyword");
    });

    test("atx_h1_marker → keyword", () => {
      expect(nodeTypeCategory.get("atx_h1_marker")).toBe("keyword");
    });

    test("heading_content → keyword", () => {
      expect(nodeTypeCategory.get("heading_content")).toBe("keyword");
    });
  });

  describe("code", () => {
    test("code_span → string", () => {
      expect(nodeTypeCategory.get("code_span")).toBe("string");
    });

    test("fenced_code_block_delimiter → comment", () => {
      expect(nodeTypeCategory.get("fenced_code_block_delimiter")).toBe("comment");
    });

    test("info_string → comment", () => {
      expect(nodeTypeCategory.get("info_string")).toBe("comment");
    });
  });

  describe("links", () => {
    test("inline_link → function", () => {
      expect(nodeTypeCategory.get("inline_link")).toBe("function");
    });

    test("link_text → function", () => {
      expect(nodeTypeCategory.get("link_text")).toBe("function");
    });

    test("link_destination → property", () => {
      expect(nodeTypeCategory.get("link_destination")).toBe("property");
    });
  });

  describe("emphasis", () => {
    test("emphasis → type", () => {
      expect(nodeTypeCategory.get("emphasis")).toBe("type");
    });

    test("strong_emphasis → constant", () => {
      expect(nodeTypeCategory.get("strong_emphasis")).toBe("constant");
    });

    test("strikethrough → comment", () => {
      expect(nodeTypeCategory.get("strikethrough")).toBe("comment");
    });
  });

  describe("list markers", () => {
    test("list_marker_minus → operator", () => {
      expect(nodeTypeCategory.get("list_marker_minus")).toBe("operator");
    });

    test("task_list_marker_checked → operator", () => {
      expect(nodeTypeCategory.get("task_list_marker_checked")).toBe("operator");
    });
  });
});

describe("markdownQuery — styledParents", () => {
  const { styledParents } = markdownQuery;

  test("is defined", () => {
    expect(styledParents).toBeDefined();
    expect(styledParents).toBeInstanceOf(Set);
  });

  test("includes atx_heading", () => {
    expect(styledParents?.has("atx_heading")).toBe(true);
  });

  test("includes setext_heading", () => {
    expect(styledParents?.has("setext_heading")).toBe(true);
  });

  test("includes emphasis", () => {
    expect(styledParents?.has("emphasis")).toBe(true);
  });

  test("includes strong_emphasis", () => {
    expect(styledParents?.has("strong_emphasis")).toBe(true);
  });

  test("includes strikethrough", () => {
    expect(styledParents?.has("strikethrough")).toBe(true);
  });

  test("includes link_text", () => {
    expect(styledParents?.has("link_text")).toBe(true);
  });

  test("includes inline_link", () => {
    expect(styledParents?.has("inline_link")).toBe(true);
  });

  test("includes shortcut_link", () => {
    expect(styledParents?.has("shortcut_link")).toBe(true);
  });
});

describe("markdownQuery — skipChildren", () => {
  const { skipChildren } = markdownQuery;

  test("is defined", () => {
    expect(skipChildren).toBeDefined();
    expect(skipChildren).toBeInstanceOf(Set);
  });

  test("includes fenced_code_block", () => {
    expect(skipChildren?.has("fenced_code_block")).toBe(true);
  });

  test("includes indented_code_block", () => {
    expect(skipChildren?.has("indented_code_block")).toBe(true);
  });

  test("includes code_span", () => {
    expect(skipChildren?.has("code_span")).toBe(true);
  });
});
