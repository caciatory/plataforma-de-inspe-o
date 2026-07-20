import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // ponytail: this volume (external, exFAT) generates AppleDouble `._*`
    // sidecar files for every file, including test files; Vitest tries to
    // parse them as tests and fails. Exclude instead of adding a real fix
    // since this is a macOS/volume quirk, not a project convention.
    // Worktrees live under `.claude/worktrees/**` inside the repo (see
    // superpowers:using-git-worktrees) — each has its own node_modules and
    // full source checkout, so without this exclude `npm test` from repo
    // root double-runs every test file and pulls in a second React copy.
    exclude: [...configDefaults.exclude, "**/._*", "**/.claude/worktrees/**"],
  },
});
