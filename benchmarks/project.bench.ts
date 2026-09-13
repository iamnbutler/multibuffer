/**
 * Project tree benchmarks.
 *
 * Targets:
 * - shouldTraverseDirectory: <10µs per call for typical include lists
 *
 * `shouldTraverseDirectory` is called O(N_dirs) times during file-tree
 * traversal. For a deep tree with several include patterns it sits on the
 * hot path of every project-scan operation, so its per-call cost matters.
 */

import { shouldTraverseDirectory } from "../src/project/glob.ts";
import type { BenchmarkSuite } from "./harness.ts";

// Typical include lists used in real-world TS / monorepo projects.
const FIVE_INCLUDE = [
  "src/**/*.ts",
  "src/**/*.tsx",
  "lib/**/*.ts",
  "tests/**/*.ts",
  "benchmarks/**/*.ts",
];

const TEN_INCLUDE = [
  "src/**/*.ts",
  "src/**/*.tsx",
  "src/**/*.js",
  "src/**/*.jsx",
  "lib/**/*.ts",
  "lib/**/*.tsx",
  "tests/**/*.ts",
  "tests/**/*.tsx",
  "benchmarks/**/*.ts",
  "packages/*/src/**/*.ts",
];

const EXCLUDE = ["node_modules", "dist", ".git"];

// Directory paths at varying depths — exercise different code paths.
const DIR_SHALLOW = "src";
const DIR_MID = "src/components/widgets";
// 8 segments — typical worst case for a deep monorepo.
const DIR_DEEP = "packages/app/src/features/editor/components/widgets/buttons";

export const projectBenchmarks: BenchmarkSuite = {
  name: "Project Tree",
  benchmarks: [
    {
      name: "shouldTraverseDirectory - 1 pattern, mid depth",
      iterations: 100_000,
      fn: () => {
        shouldTraverseDirectory(DIR_MID, ["src/**/*.ts"], EXCLUDE);
      },
    },
    {
      name: "shouldTraverseDirectory - 5 patterns, shallow",
      iterations: 100_000,
      fn: () => {
        shouldTraverseDirectory(DIR_SHALLOW, FIVE_INCLUDE, EXCLUDE);
      },
    },
    {
      name: "shouldTraverseDirectory - 5 patterns, mid depth",
      iterations: 100_000,
      fn: () => {
        shouldTraverseDirectory(DIR_MID, FIVE_INCLUDE, EXCLUDE);
      },
    },
    {
      name: "shouldTraverseDirectory - 5 patterns, deep (8 segments)",
      iterations: 100_000,
      fn: () => {
        shouldTraverseDirectory(DIR_DEEP, FIVE_INCLUDE, EXCLUDE);
      },
    },
    {
      name: "shouldTraverseDirectory - 10 patterns, deep (8 segments)",
      iterations: 100_000,
      fn: () => {
        shouldTraverseDirectory(DIR_DEEP, TEN_INCLUDE, EXCLUDE);
      },
    },
    {
      name: "shouldTraverseDirectory - no include, deep",
      iterations: 100_000,
      fn: () => {
        shouldTraverseDirectory(DIR_DEEP, [], EXCLUDE);
      },
    },
  ],
};
