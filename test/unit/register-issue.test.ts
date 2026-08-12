import { describe, expect, it, vi } from "vitest";

import {
  parseArguments,
  PROJECT_ITEM_LIMIT,
  registerIssue,
  resolveAgentFromLabels,
  resolveGhPath,
  runRegisterIssueCommand,
  waitForProjectItem,
} from "../../scripts/register-issue-lib.mjs";

const options = {
  issue: "209",
  repo: "reitojike/stage-tracker",
  dryRun: false,
};

const ISSUE_CONTENT_ID = "I_kwDOExample0";

type MockState = {
  issueLabels: string[];
  registered: boolean;
  status?: string;
  model?: string;
  failStatusUpdate?: boolean;
  projectItemsAtLimit?: boolean;
};

const statusNamesByOptionId = new Map([
  ["0c779f74", "Todo"],
  ["75a98976", "In Progress"],
  ["52cced27", "Blocked"],
  ["f1e50cdb", "Done"],
]);

const modelNamesByOptionId = new Map([
  ["d233b8f2", "Opus"],
  ["7b1942f7", "Sonnet"],
  ["6e152153", "Haiku"],
  ["8e1daf94", "Sol"],
  ["c992ffb2", "Terra"],
  ["09f22e15", "Luna"],
]);

const valuesAfter = (args: string[], flag: string) =>
  args.flatMap((argument, index) => (args[index - 1] === flag ? [argument] : []));

const handleIssueView = (state: MockState) =>
  JSON.stringify({ id: ISSUE_CONTENT_ID, labels: state.issueLabels.map((name) => ({ name })) });

const handleIssueEdit = (state: MockState, args: string[]) => {
  const removed = valuesAfter(args, "--remove-label");
  const added = valuesAfter(args, "--add-label");
  state.issueLabels = [...state.issueLabels.filter((label) => !removed.includes(label)), ...added];
  return "";
};

const handleProjectItemList = (state: MockState) => {
  if (state.projectItemsAtLimit === true) {
    const items = Array.from({ length: PROJECT_ITEM_LIMIT }, (_, index) => ({
      id: `unrelated-${index}`,
      content: { number: index },
    }));
    return JSON.stringify({ items });
  }
  const items: object[] = state.registered
    ? [
        {
          id: "item-id",
          status: state.status,
          model: state.model,
          content: { number: 209, repository: options.repo },
        },
      ]
    : [];
  return JSON.stringify({ items });
};

const handleApi = (state: MockState, args: string[]) => {
  const query = args.find((argument) => argument.startsWith("query="));
  const optionArgument = args.find((argument) => argument.startsWith("option="));
  const optionId = optionArgument?.slice("option=".length);
  if (query?.includes("addProjectV2ItemById") === true) {
    state.registered = true;
    return JSON.stringify({ data: { addProjectV2ItemById: { item: { id: "item-id" } } } });
  }
  if (query?.includes("clearProjectV2ItemFieldValue") === true) {
    state.model = undefined;
    return "";
  }
  if (optionId !== undefined && statusNamesByOptionId.has(optionId)) {
    if (state.failStatusUpdate === true) throw new Error("status update failed");
    state.status = statusNamesByOptionId.get(optionId);
    return "";
  }
  if (optionId !== undefined && modelNamesByOptionId.has(optionId)) {
    state.model = modelNamesByOptionId.get(optionId);
    return "";
  }
  throw new Error(`unexpected api call: ${args.join(" ")}`);
};

const createRunGh = (state: MockState) =>
  vi.fn((args: string[]) => {
    if (args[0] === "issue" && args[1] === "view") return handleIssueView(state);
    if (args[0] === "issue" && args[1] === "edit") return handleIssueEdit(state, args);
    if (args[0] === "project") return handleProjectItemList(state);
    if (args[0] === "api") return handleApi(state, args);
    throw new Error(`unexpected command: ${args.join(" ")}`);
  });

describe("parseArguments", () => {
  it.each([
    { args: ["--wat"], message: "unknown argument" },
    { args: ["--issue"], message: "--issue requires a value" },
    { args: ["--issue", "abc"], message: "--issue must be a number" },
    { args: ["--issue", "209", "--repo", "invalid"], message: "--repo must be owner/name" },
  ])("rejects invalid arguments: $message", ({ args, message }) => {
    expect(() => parseArguments(args)).toThrow(message);
  });

  it("parses valid arguments and defaults", () => {
    expect(parseArguments(["--issue", "209"])).toEqual(options);
  });

  it("parses --dry-run", () => {
    expect(parseArguments(["--issue", "209", "--dry-run"])).toEqual({
      ...options,
      dryRun: true,
    });
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
});

describe("resolveAgentFromLabels", () => {
  it("rejects an issue with no agent:* label", () => {
    expect(() => resolveAgentFromLabels([{ name: "bug" }])).toThrow(
      "issue must have exactly one agent:* label",
    );
  });

  it("rejects an issue with multiple agent:* labels", () => {
    expect(() => resolveAgentFromLabels([{ name: "agent:sol" }, { name: "agent:terra" }])).toThrow(
      "issue must have exactly one agent:* label",
    );
  });

  it("rejects an unrecognized agent:* label", () => {
    expect(() => resolveAgentFromLabels([{ name: "agent:bogus" }])).toThrow(
      "unknown agent label: agent:bogus",
    );
  });

  it("resolves the agent from the single agent:* label", () => {
    expect(resolveAgentFromLabels([{ name: "bug" }, { name: "agent:opus" }])).toBe("opus");
  });
});

describe("waitForProjectItem", () => {
  const notRegisteredList = JSON.stringify({ items: [] });
  const registeredList = JSON.stringify({
    items: [{ id: "item-id", content: { number: 209, repository: options.repo } }],
  });

  it("returns immediately without sleeping when the item is already listed", () => {
    const runGh = vi.fn(() => registeredList);
    const sleep = vi.fn();
    const item = waitForProjectItem(runGh, options.repo, options.issue, { sleep });
    expect(item.id).toBe("item-id");
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries with the injected sleep until the item becomes visible", () => {
    let calls = 0;
    const runGh = vi.fn(() => {
      calls += 1;
      return calls < 3 ? notRegisteredList : registeredList;
    });
    const sleep = vi.fn();
    const item = waitForProjectItem(runGh, options.repo, options.issue, {
      sleep,
      attempts: 5,
      delayMs: 10,
    });
    expect(item.id).toBe("item-id");
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(10);
  });

  it("gives up after the configured attempts and rethrows", () => {
    const runGh = vi.fn(() => notRegisteredList);
    const sleep = vi.fn();
    expect(() =>
      waitForProjectItem(runGh, options.repo, options.issue, { sleep, attempts: 3, delayMs: 10 }),
    ).toThrow("issue is not registered in the expected GitHub Project");
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("does not retry on an unrelated error", () => {
    const runGh = vi.fn(() => {
      throw new Error("boom");
    });
    const sleep = vi.fn();
    expect(() =>
      waitForProjectItem(runGh, options.repo, options.issue, { sleep, attempts: 5, delayMs: 10 }),
    ).toThrow("boom");
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe("registerIssue label validation", () => {
  it("writes nothing when the issue has no agent:* label", () => {
    const state: MockState = { issueLabels: ["bug"], registered: false };
    const runGh = createRunGh(state);
    const log = vi.fn();
    expect(() => registerIssue(options, { runGh, log, sleep: vi.fn() })).toThrow(
      "issue must have exactly one agent:* label",
    );
    expect(runGh).toHaveBeenCalledTimes(1);
    expect(runGh).toHaveBeenCalledWith([
      "issue",
      "view",
      "209",
      "--repo",
      options.repo,
      "--json",
      "id,labels",
    ]);
    expect(state.registered).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });

  it("writes nothing when the issue has multiple agent:* labels", () => {
    const state: MockState = { issueLabels: ["agent:sol", "agent:terra"], registered: false };
    const runGh = createRunGh(state);
    const log = vi.fn();
    expect(() => registerIssue(options, { runGh, log, sleep: vi.fn() })).toThrow(
      "issue must have exactly one agent:* label",
    );
    expect(runGh).toHaveBeenCalledTimes(1);
    expect(state.registered).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });

  it("writes nothing when the agent:* label is unrecognized", () => {
    const state: MockState = { issueLabels: ["agent:bogus"], registered: false };
    const runGh = createRunGh(state);
    const log = vi.fn();
    expect(() => registerIssue(options, { runGh, log, sleep: vi.fn() })).toThrow(
      "unknown agent label: agent:bogus",
    );
    expect(runGh).toHaveBeenCalledTimes(1);
    expect(state.registered).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });
});

describe("registerIssue", () => {
  it("registers the issue, sets Status to Todo, and sets Model from the agent label", () => {
    const state: MockState = { issueLabels: ["agent:sol"], registered: false };
    const runGh = createRunGh(state);
    const log = vi.fn();
    registerIssue(options, { runGh, log, sleep: vi.fn() });
    expect(state.registered).toBe(true);
    expect(state.status).toBe("Todo");
    expect(state.model).toBe("Sol");
    expect(log).toHaveBeenCalledWith(
      "OK: reitojike/stage-tracker#209 をGitHub Projectへ登録しました",
    );
    expect(log).toHaveBeenCalledWith(
      "OK: reitojike/stage-tracker#209 のProject Status -> Todo に更新しました",
    );
    expect(log).toHaveBeenCalledWith(
      "OK: reitojike/stage-tracker#209 の agent:sol とProject Model=Sol を同期しました",
    );
  });

  it("reuses the existing Project item when the issue is already registered", () => {
    const state: MockState = {
      issueLabels: ["agent:opus"],
      registered: true,
      status: "Blocked",
      model: "Terra",
    };
    const runGh = createRunGh(state);
    const log = vi.fn();
    registerIssue(options, { runGh, log, sleep: vi.fn() });
    expect(state.status).toBe("Todo");
    expect(state.model).toBe("Opus");
    expect(runGh).toHaveBeenCalledWith(
      expect.arrayContaining([expect.stringContaining("addProjectV2ItemById")]),
    );
  });
});

describe("registerIssue failures", () => {
  it("propagates the reused Project item limit guard when the item cannot be found after registering", () => {
    const state: MockState = {
      issueLabels: ["agent:sol"],
      registered: false,
      projectItemsAtLimit: true,
    };
    const runGh = createRunGh(state);
    const log = vi.fn();
    const sleep = vi.fn();
    expect(() => registerIssue(options, { runGh, log, sleep })).toThrow(
      `Project item list reached the ${PROJECT_ITEM_LIMIT}-item limit`,
    );
    expect(sleep).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("propagates a Status update failure without setting the Model", () => {
    const state: MockState = {
      issueLabels: ["agent:sol"],
      registered: false,
      failStatusUpdate: true,
    };
    const runGh = createRunGh(state);
    const log = vi.fn();
    expect(() => registerIssue(options, { runGh, log, sleep: vi.fn() })).toThrow(
      "status update failed",
    );
    expect(state.model).toBeUndefined();
    expect(log).toHaveBeenCalledWith(
      "OK: reitojike/stage-tracker#209 をGitHub Projectへ登録しました",
    );
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining("Project Model"));
  });
});

describe("registerIssue dry-run", () => {
  it("does not run any GitHub CLI command or sleep in dry-run mode", () => {
    const runGh = vi.fn();
    const sleep = vi.fn();
    const log = vi.fn();
    registerIssue({ ...options, dryRun: true }, { runGh, log, sleep });
    expect(runGh).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      "[dry-run] reitojike/stage-tracker#209: Project item-add (registered issue reuses its existing item)",
    );
    expect(log).toHaveBeenCalledWith(
      "[dry-run] reitojike/stage-tracker#209: Project Status -> Todo",
    );
    expect(log).toHaveBeenCalledWith(
      "[dry-run] reitojike/stage-tracker#209: Project Model -> resolved from the issue's agent:* label at execution time",
    );
    expect(log).toHaveBeenCalledWith("[dry-run] no GitHub data was changed");
  });
});

describe("runRegisterIssueCommand", () => {
  it("does not resolve or execute GitHub CLI for dry-run", () => {
    const exists = vi.fn(() => false);
    const execute = vi.fn(() => "");
    runRegisterIssueCommand(["--issue", "209", "--dry-run"], {
      configuredPath: undefined,
      platform: "linux",
      exists,
      execute,
      log: vi.fn(),
      sleep: vi.fn(),
    });
    expect(exists).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("resolves GitHub CLI and completes the full registration for a real run", () => {
    const state: MockState = { issueLabels: ["agent:haiku"], registered: false };
    const log = vi.fn();
    runRegisterIssueCommand(["--issue", "209"], {
      configuredPath: "/usr/bin/gh",
      platform: "linux",
      exists: () => true,
      execute: (_path: string, args: string[]) => createRunGh(state)(args),
      log,
      sleep: vi.fn(),
    });
    expect(state.registered).toBe(true);
    expect(state.status).toBe("Todo");
    expect(state.model).toBe("Haiku");
    expect(log).toHaveBeenCalledWith(
      "OK: reitojike/stage-tracker#209 の agent:haiku とProject Model=Haiku を同期しました",
    );
  });
});
