import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  isCodexProfileResolutionError,
  isValidTier,
  resolveCodexHome,
  resolveTierModel,
} from "../../scripts/resolve-codex-tier-lib.mjs";

type ResolutionError = Error & { code: string };

const isResolutionError = (value: unknown): value is ResolutionError =>
  value instanceof Error && "code" in value && typeof value.code === "string";

const errnoError = (code: string, message: string): NodeJS.ErrnoException =>
  Object.assign(new Error(message), { code });

const FAKE_HOME = process.platform === "win32" ? "C:\\fake-home" : "/fake-home";
const FAKE_CUSTOM_HOME = process.platform === "win32" ? "C:\\custom\\home" : "/custom/home";
const homedir = () => FAKE_HOME;

const fakeFiles = (files: Record<string, string>) => ({
  readFileSync: (path: string) => {
    const content = Object.hasOwn(files, path) ? files[path] : undefined;
    if (content === undefined) throw errnoError("ENOENT", `no such file, open '${path}'`);
    return content;
  },
});

const unreadable = () => ({
  readFileSync: () => {
    throw errnoError("EACCES", "permission denied");
  },
});

const expectResolutionFailure = (run: () => unknown, code: string) => {
  try {
    run();
    expect.unreachable();
  } catch (error) {
    expect(isCodexProfileResolutionError(error)).toBe(true);
    if (!isResolutionError(error)) throw new Error("expected a resolution error with a code");
    expect(error.code).toBe(code);
  }
};

const profilePath = (tier: string) => join(FAKE_HOME, ".codex", `${tier}.config.toml`);

describe("isValidTier", () => {
  it("accepts only the fixed tier set", () => {
    expect(isValidTier("sol")).toBe(true);
    expect(isValidTier("terra")).toBe(true);
    expect(isValidTier("luna")).toBe(true);
    expect(isValidTier("opus")).toBe(false);
    expect(isValidTier("")).toBe(false);
  });
});

describe("resolveCodexHome", () => {
  it("defaults to <home>/.codex when CODEX_HOME is unset", () => {
    expect(resolveCodexHome({ env: {}, homedir })).toBe(join(FAKE_HOME, ".codex"));
  });

  it("defaults to <home>/.codex when CODEX_HOME is empty", () => {
    expect(resolveCodexHome({ env: { CODEX_HOME: "" }, homedir })).toBe(join(FAKE_HOME, ".codex"));
  });

  it("uses an absolute CODEX_HOME as-is", () => {
    expect(resolveCodexHome({ env: { CODEX_HOME: FAKE_CUSTOM_HOME }, homedir })).toBe(
      FAKE_CUSTOM_HOME,
    );
  });

  it("stops on a relative CODEX_HOME", () => {
    expectResolutionFailure(
      () => resolveCodexHome({ env: { CODEX_HOME: "relative/home" }, homedir }),
      "CODEX_HOME_RELATIVE",
    );
  });
});

describe("resolveTierModel (成功系)", () => {
  it("resolves the model for each of the three tiers", () => {
    const files = fakeFiles({
      [profilePath("sol")]: 'model = "fixture-sol"\n',
      [profilePath("terra")]: 'model = "fixture-terra"\n',
      [profilePath("luna")]: 'model = "fixture-luna"\n',
    });
    expect(resolveTierModel("sol", { env: {}, homedir, ...files })).toBe("fixture-sol");
    expect(resolveTierModel("terra", { env: {}, homedir, ...files })).toBe("fixture-terra");
    expect(resolveTierModel("luna", { env: {}, homedir, ...files })).toBe("fixture-luna");
  });

  it("accepts a profile prefixed with a UTF-8 BOM", () => {
    const files = fakeFiles({
      [profilePath("sol")]: '﻿# comment\nmodel = "fixture-sol"\n',
    });
    expect(resolveTierModel("sol", { env: {}, homedir, ...files })).toBe("fixture-sol");
  });
});

describe("resolveTierModel (失敗系)", () => {
  it("stops when the tier is not in the fixed set", () => {
    const files = fakeFiles({});
    expectResolutionFailure(
      () => resolveTierModel("opus", { env: {}, homedir, ...files }),
      "UNKNOWN_TIER",
    );
  });

  it("stops when the profile file is missing", () => {
    const files = fakeFiles({});
    expectResolutionFailure(
      () => resolveTierModel("sol", { env: {}, homedir, ...files }),
      "FILE_MISSING",
    );
  });

  it("stops when the profile file cannot be read", () => {
    expectResolutionFailure(
      () => resolveTierModel("sol", { env: {}, homedir, ...unreadable() }),
      "FILE_UNREADABLE",
    );
  });

  it("stops when the profile is not valid TOML", () => {
    const files = fakeFiles({ [profilePath("sol")]: "this is not = toml = at all\n" });
    expectResolutionFailure(
      () => resolveTierModel("sol", { env: {}, homedir, ...files }),
      "TOML_PARSE_ERROR",
    );
  });

  it("stops when the model key is missing", () => {
    const files = fakeFiles({ [profilePath("sol")]: "# empty profile\n" });
    expectResolutionFailure(
      () => resolveTierModel("sol", { env: {}, homedir, ...files }),
      "MODEL_KEY_MISSING",
    );
  });

  it("stops when the model value is empty", () => {
    const files = fakeFiles({ [profilePath("sol")]: 'model = ""\n' });
    expectResolutionFailure(
      () => resolveTierModel("sol", { env: {}, homedir, ...files }),
      "MODEL_KEY_MISSING",
    );
  });

  it("stops when the profile has a key beyond the allowed set", () => {
    const files = fakeFiles({
      [profilePath("sol")]: 'model = "fixture-sol"\nmodel_reasoning_effort = "high"\n',
    });
    expectResolutionFailure(
      () => resolveTierModel("sol", { env: {}, homedir, ...files }),
      "UNSUPPORTED_PROFILE_KEY",
    );
  });

  it("does not fall back to a default model or another tier on failure", () => {
    const files = fakeFiles({ [profilePath("terra")]: 'model = "fixture-terra"\n' });
    expectResolutionFailure(
      () => resolveTierModel("sol", { env: {}, homedir, ...files }),
      "FILE_MISSING",
    );
  });
});

const cliScriptPath = join(import.meta.dirname, "..", "..", "scripts", "resolve-codex-tier.mjs");

const runCli = (args: string[], codexHome: string) =>
  spawnSync(process.execPath, [cliScriptPath, ...args], {
    encoding: "utf8",
    env: { ...process.env, CODEX_HOME: codexHome },
  });

const withTempCodexHome = (
  setup: (codexHome: string) => void,
  run: (codexHome: string) => void,
) => {
  const codexHome = mkdtempSync(join(os.tmpdir(), "resolve-codex-tier-cli-"));
  try {
    setup(codexHome);
    run(codexHome);
  } finally {
    rmSync(codexHome, { recursive: true, force: true });
  }
};

describe("CLIラッパー(scripts/resolve-codex-tier.mjs)", () => {
  it("prints exactly one line to stdout and exits 0 on success", () => {
    withTempCodexHome(
      (codexHome) => writeFileSync(join(codexHome, "sol.config.toml"), 'model = "fixture-sol"\n'),
      (codexHome) => {
        const result = runCli(["sol"], codexHome);
        expect(result.status).toBe(0);
        expect(result.stdout).toBe("fixture-sol\n");
        expect(result.stderr).toBe("");
      },
    );
  });

  it("prints nothing to stdout and exits non-zero when the profile is missing", () => {
    withTempCodexHome(
      () => {},
      (codexHome) => {
        const result = runCli(["sol"], codexHome);
        expect(result.status).not.toBe(0);
        expect(result.stdout).toBe("");
        expect(result.stderr).toContain("FILE_MISSING");
      },
    );
  });

  it("prints nothing to stdout and exits non-zero for an unknown tier", () => {
    withTempCodexHome(
      () => {},
      (codexHome) => {
        const result = runCli(["opus"], codexHome);
        expect(result.status).not.toBe(0);
        expect(result.stdout).toBe("");
        expect(result.stderr).toContain("UNKNOWN_TIER");
      },
    );
  });

  it("prints nothing to stdout and exits non-zero when no tier is given", () => {
    withTempCodexHome(
      () => {},
      (codexHome) => {
        const result = runCli([], codexHome);
        expect(result.status).not.toBe(0);
        expect(result.stdout).toBe("");
      },
    );
  });
});
