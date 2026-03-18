/**
 * Tests for language detection utility.
 */

import { describe, expect, it } from "bun:test";
import {
  detectLanguage,
  getGrammarName,
  isLanguageSupported,
} from "../../src/renderer/languages.ts";

describe("detectLanguage", () => {
  describe("TypeScript / JavaScript", () => {
    it("should detect .ts as typescript", () => {
      expect(detectLanguage("main.ts")).toBe("typescript");
      expect(detectLanguage("src/lib.ts")).toBe("typescript");
    });

    it("should detect .tsx as tsx", () => {
      expect(detectLanguage("App.tsx")).toBe("tsx");
    });

    it("should detect .js as javascript", () => {
      expect(detectLanguage("index.js")).toBe("javascript");
    });

    it("should detect .jsx as jsx", () => {
      expect(detectLanguage("Component.jsx")).toBe("jsx");
    });

    it("should detect module extensions", () => {
      expect(detectLanguage("module.mts")).toBe("typescript");
      expect(detectLanguage("module.cts")).toBe("typescript");
      expect(detectLanguage("module.mjs")).toBe("javascript");
      expect(detectLanguage("module.cjs")).toBe("javascript");
    });
  });

  describe("Systems languages", () => {
    it("should detect .rs as rust", () => {
      expect(detectLanguage("main.rs")).toBe("rust");
      expect(detectLanguage("src/lib.rs")).toBe("rust");
    });

    it("should detect .go as go", () => {
      expect(detectLanguage("main.go")).toBe("go");
    });

    it("should detect C/C++ extensions", () => {
      expect(detectLanguage("main.c")).toBe("c");
      expect(detectLanguage("header.h")).toBe("c");
      expect(detectLanguage("main.cpp")).toBe("cpp");
      expect(detectLanguage("main.cc")).toBe("cpp");
      expect(detectLanguage("main.cxx")).toBe("cpp");
      expect(detectLanguage("header.hpp")).toBe("cpp");
    });

    it("should detect .zig as zig", () => {
      expect(detectLanguage("main.zig")).toBe("zig");
    });
  });

  describe("Scripting languages", () => {
    it("should detect .py as python", () => {
      expect(detectLanguage("script.py")).toBe("python");
      expect(detectLanguage("types.pyi")).toBe("python");
    });

    it("should detect .rb as ruby", () => {
      expect(detectLanguage("app.rb")).toBe("ruby");
      expect(detectLanguage("Gemfile.rake")).toBe("ruby");
    });

    it("should detect .lua as lua", () => {
      expect(detectLanguage("init.lua")).toBe("lua");
    });
  });

  describe("Web languages", () => {
    it("should detect .html as html", () => {
      expect(detectLanguage("index.html")).toBe("html");
      expect(detectLanguage("page.htm")).toBe("html");
    });

    it("should detect .css as css", () => {
      expect(detectLanguage("styles.css")).toBe("css");
      expect(detectLanguage("styles.scss")).toBe("css");
    });
  });

  describe("Data formats", () => {
    it("should detect .json as json", () => {
      expect(detectLanguage("package.json")).toBe("json");
      expect(detectLanguage("tsconfig.jsonc")).toBe("json");
    });

    it("should detect .yaml/.yml as yaml", () => {
      expect(detectLanguage("config.yaml")).toBe("yaml");
      expect(detectLanguage("docker-compose.yml")).toBe("yaml");
    });

    it("should detect .toml as toml", () => {
      expect(detectLanguage("Cargo.toml")).toBe("toml");
    });
  });

  describe("Shell scripts", () => {
    it("should detect shell extensions", () => {
      expect(detectLanguage("script.sh")).toBe("bash");
      expect(detectLanguage("script.bash")).toBe("bash");
      expect(detectLanguage("script.zsh")).toBe("bash");
    });
  });

  describe("Documentation", () => {
    it("should detect .md as markdown", () => {
      expect(detectLanguage("README.md")).toBe("markdown");
      expect(detectLanguage("docs/guide.mdx")).toBe("markdown");
    });
  });

  describe("JVM languages", () => {
    it("should detect .java as java", () => {
      expect(detectLanguage("Main.java")).toBe("java");
    });

    it("should detect .kt as kotlin", () => {
      expect(detectLanguage("Main.kt")).toBe("kotlin");
      expect(detectLanguage("build.gradle.kts")).toBe("kotlin");
    });
  });

  describe("Apple languages", () => {
    it("should detect .swift as swift", () => {
      expect(detectLanguage("App.swift")).toBe("swift");
    });
  });

  describe("Database", () => {
    it("should detect .sql as sql", () => {
      expect(detectLanguage("migration.sql")).toBe("sql");
    });
  });

  describe("Special filenames", () => {
    it("should detect Dockerfile", () => {
      expect(detectLanguage("Dockerfile")).toBe("dockerfile");
      expect(detectLanguage("path/to/Dockerfile")).toBe("dockerfile");
    });

    it("should detect shell config files", () => {
      expect(detectLanguage(".bashrc")).toBe("bash");
      expect(detectLanguage(".zshrc")).toBe("bash");
      expect(detectLanguage(".profile")).toBe("bash");
    });

    it("should detect Ruby special files", () => {
      expect(detectLanguage("Gemfile")).toBe("ruby");
      expect(detectLanguage("Rakefile")).toBe("ruby");
    });

    it("should be case-insensitive for special filenames", () => {
      expect(detectLanguage("dockerfile")).toBe("dockerfile");
      expect(detectLanguage("DOCKERFILE")).toBe("dockerfile");
    });
  });

  describe("Fallback", () => {
    it("should return plaintext for unknown extensions", () => {
      expect(detectLanguage("file.xyz")).toBe("plaintext");
      expect(detectLanguage("noextension")).toBe("plaintext");
    });

    it("should return plaintext for .gitignore", () => {
      expect(detectLanguage(".gitignore")).toBe("plaintext");
    });
  });

  describe("Path handling", () => {
    it("should extract filename from full path", () => {
      expect(detectLanguage("src/components/Button.tsx")).toBe("tsx");
      expect(detectLanguage("/home/user/project/main.rs")).toBe("rust");
    });

    it("should handle paths with dots in directory names", () => {
      expect(detectLanguage("node_modules/@types/react/index.d.ts")).toBe("typescript");
    });
  });
});

describe("isLanguageSupported", () => {
  it("should return true for supported languages", () => {
    expect(isLanguageSupported("typescript")).toBe(true);
    expect(isLanguageSupported("rust")).toBe(true);
    expect(isLanguageSupported("python")).toBe(true);
  });

  it("should return false for plaintext", () => {
    expect(isLanguageSupported("plaintext")).toBe(false);
  });
});

describe("getGrammarName", () => {
  it("should return the language id for most languages", () => {
    expect(getGrammarName("rust")).toBe("rust");
    expect(getGrammarName("python")).toBe("python");
    expect(getGrammarName("go")).toBe("go");
  });

  it("should return typescript for tsx", () => {
    expect(getGrammarName("typescript")).toBe("typescript");
    expect(getGrammarName("tsx")).toBe("typescript");
  });

  it("should return javascript for jsx", () => {
    expect(getGrammarName("javascript")).toBe("javascript");
    expect(getGrammarName("jsx")).toBe("javascript");
  });

  it("should return null for plaintext", () => {
    expect(getGrammarName("plaintext")).toBe(null);
  });
});
