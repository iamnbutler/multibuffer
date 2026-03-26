/**
 * Tests for language detection from file paths and extensions.
 */

import { describe, expect, test } from "bun:test";
import {
  detectLanguage,
  getSupportedExtensions,
  getSupportedLanguages,
} from "../../src/renderer/language-detection.ts";

describe("detectLanguage", () => {
  describe("TypeScript/JavaScript", () => {
    test("detects .ts as typescript", () => {
      expect(detectLanguage("src/main.ts")).toBe("typescript");
    });

    test("detects .tsx as tsx", () => {
      expect(detectLanguage("App.tsx")).toBe("tsx");
    });

    test("detects .js as javascript", () => {
      expect(detectLanguage("index.js")).toBe("javascript");
    });

    test("detects .jsx as jsx", () => {
      expect(detectLanguage("Component.jsx")).toBe("jsx");
    });

    test("detects .mts as typescript", () => {
      expect(detectLanguage("module.mts")).toBe("typescript");
    });

    test("detects .cjs as javascript", () => {
      expect(detectLanguage("config.cjs")).toBe("javascript");
    });
  });

  describe("systems languages", () => {
    test("detects .rs as rust", () => {
      expect(detectLanguage("src/main.rs")).toBe("rust");
    });

    test("detects .go as go", () => {
      expect(detectLanguage("main.go")).toBe("go");
    });

    test("detects .c as c", () => {
      expect(detectLanguage("main.c")).toBe("c");
    });

    test("detects .h as c", () => {
      expect(detectLanguage("header.h")).toBe("c");
    });

    test("detects .cpp as cpp", () => {
      expect(detectLanguage("main.cpp")).toBe("cpp");
    });
  });

  describe("scripting languages", () => {
    test("detects .py as python", () => {
      expect(detectLanguage("script.py")).toBe("python");
    });

    test("detects .rb as ruby", () => {
      expect(detectLanguage("app.rb")).toBe("ruby");
    });

    test("detects .sh as bash", () => {
      expect(detectLanguage("deploy.sh")).toBe("bash");
    });

    test("detects .lua as lua", () => {
      expect(detectLanguage("init.lua")).toBe("lua");
    });
  });

  describe("web languages", () => {
    test("detects .html as html", () => {
      expect(detectLanguage("index.html")).toBe("html");
    });

    test("detects .css as css", () => {
      expect(detectLanguage("styles.css")).toBe("css");
    });
  });

  describe("data formats", () => {
    test("detects .json as json", () => {
      expect(detectLanguage("package.json")).toBe("json");
    });

    test("detects .yaml as yaml", () => {
      expect(detectLanguage("config.yaml")).toBe("yaml");
    });

    test("detects .yml as yaml", () => {
      expect(detectLanguage("ci.yml")).toBe("yaml");
    });

    test("detects .toml as toml", () => {
      expect(detectLanguage("Cargo.toml")).toBe("toml");
    });
  });

  describe("markup", () => {
    test("detects .md as markdown", () => {
      expect(detectLanguage("README.md")).toBe("markdown");
    });

    test("detects .mdx as markdown", () => {
      expect(detectLanguage("docs.mdx")).toBe("markdown");
    });
  });

  describe("special filenames", () => {
    test("detects Dockerfile", () => {
      expect(detectLanguage("Dockerfile")).toBe("dockerfile");
    });

    test("detects Makefile as bash", () => {
      expect(detectLanguage("Makefile")).toBe("bash");
    });

    test("detects .bashrc as bash", () => {
      expect(detectLanguage(".bashrc")).toBe("bash");
    });

    test("detects Gemfile as ruby", () => {
      expect(detectLanguage("Gemfile")).toBe("ruby");
    });
  });

  describe("path handling", () => {
    test("extracts filename from full path", () => {
      expect(detectLanguage("/home/user/project/src/lib.rs")).toBe("rust");
    });

    test("handles nested paths", () => {
      expect(detectLanguage("a/b/c/d/main.py")).toBe("python");
    });

    test("returns null for unknown extension", () => {
      expect(detectLanguage("file.xyz")).toBeNull();
    });

    test("returns null for extensionless unknown file", () => {
      expect(detectLanguage("LICENSE")).toBeNull();
    });

    test("is case-insensitive for extensions", () => {
      expect(detectLanguage("FILE.RS")).toBe("rust");
    });

    test("is case-insensitive for filenames", () => {
      expect(detectLanguage("DOCKERFILE")).toBe("dockerfile");
    });
  });
});

describe("getSupportedExtensions", () => {
  test("returns an array of strings", () => {
    const extensions = getSupportedExtensions();
    expect(extensions.length).toBeGreaterThan(0);
    expect(extensions).toContain("ts");
    expect(extensions).toContain("rs");
    expect(extensions).toContain("py");
  });
});

describe("getSupportedLanguages", () => {
  test("returns unique language IDs", () => {
    const languages = getSupportedLanguages();
    expect(languages.length).toBeGreaterThan(0);
    expect(languages).toContain("typescript");
    expect(languages).toContain("rust");
    expect(languages).toContain("python");
    // Check uniqueness
    expect(new Set(languages).size).toBe(languages.length);
  });
});
