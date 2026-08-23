/**
 * Tests for glob pattern matching.
 */

import { describe, expect, test } from "bun:test";
import {
  compileGlob,
  createGlobMatcher,
  matchesAny,
  shouldInclude,
  shouldTraverseDirectory,
} from "../../src/project/glob.ts";

describe("compileGlob", () => {
  describe("literal patterns", () => {
    test("exact match", () => {
      const regex = compileGlob("foo.txt");
      expect(regex.test("foo.txt")).toBe(true);
      expect(regex.test("bar.txt")).toBe(false);
      expect(regex.test("foo.txt.bak")).toBe(false);
    });

    test("path with slashes", () => {
      const regex = compileGlob("src/index.ts");
      expect(regex.test("src/index.ts")).toBe(true);
      expect(regex.test("lib/index.ts")).toBe(false);
    });
  });

  describe("* wildcard", () => {
    test("matches any characters except slash", () => {
      const regex = compileGlob("*.ts");
      expect(regex.test("index.ts")).toBe(true);
      expect(regex.test("foo.ts")).toBe(true);
      expect(regex.test("src/index.ts")).toBe(false);
      expect(regex.test(".ts")).toBe(true);
    });

    test("in middle of pattern", () => {
      const regex = compileGlob("foo*.ts");
      expect(regex.test("foo.ts")).toBe(true);
      expect(regex.test("foobar.ts")).toBe(true);
      expect(regex.test("bar.ts")).toBe(false);
    });

    test("multiple wildcards", () => {
      const regex = compileGlob("*.*");
      expect(regex.test("foo.ts")).toBe(true);
      expect(regex.test("a.b")).toBe(true);
      expect(regex.test("foo")).toBe(false);
    });
  });

  describe("** globstar", () => {
    test("matches any path", () => {
      const regex = compileGlob("**/*.ts");
      expect(regex.test("index.ts")).toBe(true);
      expect(regex.test("src/index.ts")).toBe(true);
      expect(regex.test("src/lib/deep/file.ts")).toBe(true);
      expect(regex.test("src/index.js")).toBe(false);
    });

    test("at start of pattern", () => {
      const regex = compileGlob("**/test.ts");
      expect(regex.test("test.ts")).toBe(true);
      expect(regex.test("src/test.ts")).toBe(true);
      expect(regex.test("a/b/c/test.ts")).toBe(true);
    });

    test("in middle of pattern", () => {
      const regex = compileGlob("src/**/index.ts");
      expect(regex.test("src/index.ts")).toBe(true);
      expect(regex.test("src/lib/index.ts")).toBe(true);
      expect(regex.test("src/a/b/c/index.ts")).toBe(true);
      expect(regex.test("lib/index.ts")).toBe(false);
    });

    test("at end of pattern", () => {
      const regex = compileGlob("src/**");
      expect(regex.test("src/")).toBe(true);
      expect(regex.test("src/foo")).toBe(true);
      expect(regex.test("src/foo/bar")).toBe(true);
    });
  });

  describe("? wildcard", () => {
    test("matches single character", () => {
      const regex = compileGlob("fo?.ts");
      expect(regex.test("foo.ts")).toBe(true);
      expect(regex.test("for.ts")).toBe(true);
      expect(regex.test("fo.ts")).toBe(false);
      expect(regex.test("fooo.ts")).toBe(false);
    });

    test("does not match slash", () => {
      const regex = compileGlob("src?index.ts");
      expect(regex.test("src/index.ts")).toBe(false);
      expect(regex.test("src_index.ts")).toBe(true);
    });
  });

  describe("character classes", () => {
    test("matches characters in brackets", () => {
      const regex = compileGlob("[abc].ts");
      expect(regex.test("a.ts")).toBe(true);
      expect(regex.test("b.ts")).toBe(true);
      expect(regex.test("c.ts")).toBe(true);
      expect(regex.test("d.ts")).toBe(false);
    });

    test("negation with !", () => {
      const regex = compileGlob("[!abc].ts");
      expect(regex.test("a.ts")).toBe(false);
      expect(regex.test("d.ts")).toBe(true);
      expect(regex.test("x.ts")).toBe(true);
    });

    test("negation with ^", () => {
      const regex = compileGlob("[^abc].ts");
      expect(regex.test("a.ts")).toBe(false);
      expect(regex.test("d.ts")).toBe(true);
    });
  });

  describe("brace expansion", () => {
    test("single brace expansion", () => {
      const regex = compileGlob("*.{ts,tsx}");
      expect(regex.test("index.ts")).toBe(true);
      expect(regex.test("index.tsx")).toBe(true);
      expect(regex.test("index.js")).toBe(false);
    });

    test("multiple alternatives", () => {
      const regex = compileGlob("{src,lib,test}/*.ts");
      expect(regex.test("src/index.ts")).toBe(true);
      expect(regex.test("lib/index.ts")).toBe(true);
      expect(regex.test("test/index.ts")).toBe(true);
      expect(regex.test("dist/index.ts")).toBe(false);
    });
  });

  describe("special regex characters are escaped", () => {
    test("dots are literal", () => {
      const regex = compileGlob("*.ts");
      expect(regex.test("Xts")).toBe(false); // . should not match any char
    });

    test("other special chars", () => {
      const regex = compileGlob("foo+bar.ts");
      expect(regex.test("foo+bar.ts")).toBe(true);
      expect(regex.test("fooobar.ts")).toBe(false);
    });
  });
});

describe("createGlobMatcher", () => {
  test("caches compiled patterns", () => {
    const matcher = createGlobMatcher();
    // Run same pattern multiple times - should use cache
    expect(matcher("*.ts", "foo.ts")).toBe(true);
    expect(matcher("*.ts", "bar.ts")).toBe(true);
    expect(matcher("*.ts", "baz.js")).toBe(false);
  });
});

describe("matchesAny", () => {
  test("returns true if any pattern matches", () => {
    const patterns = ["*.ts", "*.tsx", "*.js"];
    expect(matchesAny(patterns, "index.ts")).toBe(true);
    expect(matchesAny(patterns, "index.tsx")).toBe(true);
    expect(matchesAny(patterns, "index.js")).toBe(true);
    expect(matchesAny(patterns, "index.css")).toBe(false);
  });

  test("empty patterns returns false", () => {
    expect(matchesAny([], "foo.ts")).toBe(false);
  });
});

describe("shouldInclude", () => {
  test("include all when no patterns", () => {
    expect(shouldInclude("foo.ts", [], [])).toBe(true);
    expect(shouldInclude("bar.js", [], [])).toBe(true);
  });

  test("include only matching patterns", () => {
    expect(shouldInclude("foo.ts", ["*.ts"], [])).toBe(true);
    expect(shouldInclude("foo.js", ["*.ts"], [])).toBe(false);
  });

  test("exclude takes precedence", () => {
    expect(shouldInclude("test.ts", ["*.ts"], ["*.test.ts"])).toBe(true);
    expect(shouldInclude("foo.test.ts", ["*.ts"], ["*.test.ts"])).toBe(false);
  });

  test("exclude with directory patterns", () => {
    expect(
      shouldInclude("node_modules/foo/index.ts", ["**/*.ts"], ["node_modules"]),
    ).toBe(false);
  });
});

describe("shouldTraverseDirectory", () => {
  test("traverse all when no patterns", () => {
    expect(shouldTraverseDirectory("src", [], [])).toBe(true);
    expect(shouldTraverseDirectory("lib/utils", [], [])).toBe(true);
  });

  test("skip excluded directories", () => {
    expect(shouldTraverseDirectory("node_modules", [], ["node_modules"])).toBe(
      false,
    );
    expect(shouldTraverseDirectory("dist", [], ["dist"])).toBe(false);
  });

  test("traverse directories that could contain matches", () => {
    expect(shouldTraverseDirectory("src", ["src/**/*.ts"], [])).toBe(true);
    expect(shouldTraverseDirectory("lib", ["src/**/*.ts"], [])).toBe(false);
  });

  test("always traverse when ** pattern is used", () => {
    expect(shouldTraverseDirectory("any", ["**/*.ts"], [])).toBe(true);
    expect(shouldTraverseDirectory("deep/nested", ["**/*.ts"], [])).toBe(true);
  });

  test("excluded directory takes precedence", () => {
    expect(
      shouldTraverseDirectory("node_modules", ["**/*.ts"], ["node_modules"]),
    ).toBe(false);
  });

  describe("brace expansion", () => {
    test("traverses a directory named by a leading brace group", () => {
      const include = ["{src,tests}/**/*.ts"];
      expect(shouldTraverseDirectory("src", include, [])).toBe(true);
      expect(shouldTraverseDirectory("tests", include, [])).toBe(true);
      expect(shouldTraverseDirectory("docs", include, [])).toBe(false);
    });

    test("traverses a directory named by an inner brace group", () => {
      const include = ["src/{a,b}/**/*.ts"];
      expect(shouldTraverseDirectory("src/a", include, [])).toBe(true);
      expect(shouldTraverseDirectory("src/b", include, [])).toBe(true);
      expect(shouldTraverseDirectory("src/c", include, [])).toBe(false);
    });

    test("agrees with shouldInclude for every brace alternative", () => {
      // Pruning is an optimisation: a directory holding a file that
      // shouldInclude() accepts must always be traversed.
      const include = ["{src,tests}/*.ts"];
      for (const dir of ["src", "tests"]) {
        expect(shouldInclude(`${dir}/index.ts`, include, [])).toBe(true);
        expect(shouldTraverseDirectory(dir, include, [])).toBe(true);
      }
    });

    test("excludes a directory named by a brace group", () => {
      const exclude = ["{node_modules,dist}"];
      expect(shouldTraverseDirectory("node_modules", [], exclude)).toBe(false);
      expect(shouldTraverseDirectory("dist", [], exclude)).toBe(false);
      expect(shouldTraverseDirectory("src", [], exclude)).toBe(true);
    });

    test("excludes nested directories named by a brace group", () => {
      // Matches the plain-pattern behaviour of exclude: ["node_modules"].
      expect(
        shouldTraverseDirectory("src/node_modules", [], ["{node_modules,dist}"]),
      ).toBe(false);
    });
  });
});
