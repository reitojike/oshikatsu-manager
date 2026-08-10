import { describe, expect, it, vi } from "vitest";

import {
  parseArguments,
  resolveGhPath,
  syncAgentModel,
} from "../../scripts/sync-agent-model-lib.mjs";

const options = {
  issue: "118",
  agent: "sol",
  repo: "reitojike/stage-tracker",
  dryRun: false,
};

type MockState = {
  labels: string[];
  model: string;
  registered?: boolean;
  failModelUpdate?: boolean;
};

const valuesAfter = (args: string[], flag: string) =>
  args.flatMap((argument, index) => (args[index - 1] === flag ? [argument] : []));

const createRunGh = (state: MockState) =>
  vi.fn((args: string[]) => {
    if (args[0] === "issue" && args[1] === "view")
      return JSON.stringify({ labels: state.labels.map((name) => ({ name })) });
    if (args[0] === "project") {
      const items =
        state.registered === false
          ? []
          : [
              {
                id: "item-id",
                model: state.model,
                content: { number: 118, repository: options.repo },
              },
            ];
      return JSON.stringify({ items });
    }
    if (args[0] === "issue" && args[1] === "edit") {
      const removed = valuesAfter(args, "--remove-label");
      const added = valuesAfter(args, "--add-label");
      state.labels = [...state.labels.filter((label) => !removed.includes(label)), ...added];
      return "";
    }
    if (args[0] === "api") {
      if (state.failModelUpdate === true) throw new Error("model update failed");
      state.model = "Sol";
      return "";
    }
    throw new Error(`unexpected command: ${args.join(" ")}`);
  });

describe("parseArguments", () => {
  it.each([
    { args: ["--wat"], message: "unknown argument" },
    { args: ["--issue", "118", "--agent"], message: "--agent requires a value" },
    { args: ["--issue", "abc", "--agent", "sol"], message: "--issue must be a number" },
    { args: ["--issue", "118", "--agent", "unknown"], message: "--agent must be" },
    {
      args: ["--issue", "118", "--agent", "sol", "--repo", "invalid"],
      message: "--repo must be owner/name",
    },
  ])("rejects invalid arguments: $message", ({ args, message }) => {
    expect(() => parseArguments(args)).toThrow(message);
  });

  it("parses valid arguments and defaults", () => {
    expect(parseArguments(["--issue", "118", "--agent", "sol"])).toEqual(options);
  });
});

describe("resolveGhPath", () => {
  it("uses an existing absolute configured path", () => {
    expect(
      resolveGhPath({
        configuredPath: "C:\\tools\\gh.exe",
        platform: "win32",
        exists: (path: string) => path === "C:\\tools\\gh.exe",
      }),
    ).toBe("C:\\tools\\gh.exe");
  });

  it("rejects a Windows configured path for Linux", () => {
    expect(() =>
      resolveGhPath({
        configuredPath: "C:\\tools\\gh.exe",
        platform: "linux",
        exists: () => true,
      }),
    ).toThrow("STAGE_TRACKER_GH_PATH must be an existing absolute path to gh");
  });

  it("checks platform candidates in order", () => {
    const exists = vi.fn((path: string) => path === "/opt/homebrew/bin/gh");
    expect(resolveGhPath({ configuredPath: undefined, platform: "darwin", exists })).toBe(
      "/opt/homebrew/bin/gh",
    );
    expect(exists.mock.calls).toEqual([["/usr/local/bin/gh"], ["/opt/homebrew/bin/gh"]]);
  });

  it("prompts for the environment variable when gh is absent", () => {
    expect(() =>
      resolveGhPath({ configuredPath: undefined, platform: "linux", exists: () => false }),
    ).toThrow("set STAGE_TRACKER_GH_PATH");
  });
});

describe("syncAgentModel", () => {
  it("removes only other agent labels and keeps unrelated labels", () => {
    const state = { labels: ["bug", "agent:terra", "agent:sol"], model: "Sol" };
    const runGh = createRunGh(state);
    syncAgentModel(options, { runGh, log: vi.fn() });
    expect(state.labels).toEqual(["bug", "agent:sol"]);
    expect(runGh).toHaveBeenCalledWith(expect.arrayContaining(["--remove-label", "agent:terra"]));
    expect(runGh).not.toHaveBeenCalledWith(expect.arrayContaining(["--remove-label", "bug"]));
  });

  it("does not begin changes when the issue is absent from the Project", () => {
    const state = { labels: ["agent:terra"], model: "Terra", registered: false };
    const runGh = createRunGh(state);
    expect(() => syncAgentModel(options, { runGh, log: vi.fn() })).toThrow(
      "issue is not registered",
    );
    expect(runGh).not.toHaveBeenCalledWith(expect.arrayContaining(["edit"]));
    expect(runGh).not.toHaveBeenCalledWith(expect.arrayContaining(["api"]));
  });

  it("rolls the label back when the Model update fails", () => {
    const state = { labels: ["agent:terra"], model: "Terra", failModelUpdate: true };
    const runGh = createRunGh(state);
    expect(() => syncAgentModel(options, { runGh, log: vi.fn() })).toThrow("model update failed");
    expect(state.labels).toEqual(["agent:terra"]);
  });

  it("reports original and attempted labels when rollback fails", () => {
    const state = { labels: ["agent:terra"], model: "Terra", failModelUpdate: true };
    const baseRunGh = createRunGh(state);
    let issueViews = 0;
    const runGh = vi.fn((args: string[]) => {
      if (args[0] === "issue" && args[1] === "view" && ++issueViews === 2)
        throw new Error("rollback read failed");
      return baseRunGh(args);
    });
    expect(() => syncAgentModel(options, { runGh, log: vi.fn() })).toThrow(
      'label rollback failed: original=["agent:terra"], attempted=agent:sol',
    );
  });
});

describe("syncAgentModel verification", () => {
  it.each([
    { labels: ["agent:sol", "agent:terra"], model: "Sol", expected: "agent label" },
    { labels: ["agent:sol"], model: "Terra", expected: "Project Model" },
  ])("fails verification for $expected mismatch", ({ labels, model, expected }) => {
    const state = { labels: ["agent:terra"], model: "Terra" };
    const runGh = createRunGh(state);
    let issueViews = 0;
    runGh.mockImplementation((args) => {
      if (args[0] === "issue" && args[1] === "view" && ++issueViews === 2) {
        state.labels = [...labels];
      }
      if (args[0] === "project" && args[1] === "item-list" && state.model === "Sol") {
        state.model = model;
      }
      return createRunGh(state)(args);
    });
    expect(() => syncAgentModel(options, { runGh, log: vi.fn() })).toThrow(expected);
    expect(state.labels).toEqual(["agent:terra"]);
  });

  it("does not run update commands in dry-run mode", () => {
    const runGh = createRunGh({ labels: [], model: "" });
    const log = vi.fn();
    syncAgentModel({ ...options, dryRun: true }, { runGh, log });
    expect(runGh).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("[dry-run] no GitHub data was changed");
  });
});
