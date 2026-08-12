import { describe, expect, it, vi } from "vitest";

import {
  parseArguments,
  PROJECT_ITEM_LIMIT,
  resolveGhPath,
  runSetIssueStatusCommand,
  setIssueStatus,
} from "../../scripts/set-issue-status-lib.mjs";

const options = {
  issue: "205",
  status: "In Progress",
  repo: "reitojike/stage-tracker",
  dryRun: false,
};

type MockState = {
  status?: string;
  registered?: boolean;
  failStatusUpdate?: boolean;
  projectItems?: number;
};

const statusNamesByOptionId = new Map([
  ["0c779f74", "Todo"],
  ["75a98976", "In Progress"],
  ["52cced27", "Blocked"],
  ["f1e50cdb", "Done"],
]);

const createRunGh = (state: MockState) =>
  vi.fn((args: string[]) => {
    if (args[0] === "project") {
      const items: object[] =
        state.registered === false
          ? []
          : [
              {
                id: "item-id",
                status: state.status,
                content: { number: 205, repository: options.repo },
              },
            ];
      while (items.length < (state.projectItems ?? items.length))
        items.push({ id: `unrelated-${items.length}`, content: { number: items.length } });
      return JSON.stringify({ items });
    }
    if (args[0] === "api") {
      if (state.failStatusUpdate === true) throw new Error("status update failed");
      const optionArgument = args.find((argument) => argument.startsWith("option="));
      const optionId = optionArgument?.slice("option=".length);
      state.status = optionId === undefined ? state.status : statusNamesByOptionId.get(optionId);
      return "";
    }
    throw new Error(`unexpected command: ${args.join(" ")}`);
  });

describe("parseArguments", () => {
  it.each([
    { args: ["--wat"], message: "unknown argument" },
    { args: ["--issue", "205", "--status"], message: "--status requires a value" },
    { args: ["--issue", "abc", "--status", "Done"], message: "--issue must be a number" },
    { args: ["--issue", "205", "--status", "Unknown"], message: "--status must be" },
    {
      args: ["--issue", "205", "--status", "Done", "--repo", "invalid"],
      message: "--repo must be owner/name",
    },
  ])("rejects invalid arguments: $message", ({ args, message }) => {
    expect(() => parseArguments(args)).toThrow(message);
  });

  it("parses valid arguments and defaults", () => {
    expect(parseArguments(["--issue", "205", "--status", "In Progress"])).toEqual(options);
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

describe("setIssueStatus", () => {
  it("uses one Project item limit for the request, guard, and error message", () => {
    const state = { registered: false, projectItems: PROJECT_ITEM_LIMIT };
    const runGh = createRunGh(state);
    expect(() => setIssueStatus(options, { runGh, log: vi.fn() })).toThrow(
      `Project item list reached the ${PROJECT_ITEM_LIMIT}-item limit`,
    );
    expect(runGh).toHaveBeenCalledWith(
      expect.arrayContaining(["--limit", String(PROJECT_ITEM_LIMIT)]),
    );
  });

  it("does not attempt an update when the issue is absent from the Project", () => {
    const state = { status: "Todo", registered: false };
    const runGh = createRunGh(state);
    expect(() => setIssueStatus(options, { runGh, log: vi.fn() })).toThrow(
      "issue is not registered",
    );
    expect(runGh).not.toHaveBeenCalledWith(expect.arrayContaining(["api"]));
  });

  it("updates the Status field and logs success after verification", () => {
    const state = { status: "Todo" };
    const runGh = createRunGh(state);
    const log = vi.fn();
    setIssueStatus(options, { runGh, log });
    expect(state.status).toBe("In Progress");
    expect(runGh).toHaveBeenCalledWith(
      expect.arrayContaining(["field=PVTSSF_lAHOAzvh3c4BfeaMzhZxC-o"]),
    );
    expect(log).toHaveBeenCalledWith(
      "OK: reitojike/stage-tracker#205 のProject Status -> In Progress に更新しました",
    );
  });

  it("rejects an unvalidated status with a descriptive error", () => {
    expect(() =>
      setIssueStatus(
        { ...options, status: "unknown", dryRun: true },
        { runGh: vi.fn(), log: vi.fn() },
      ),
    ).toThrow("status must be Todo, In Progress, Blocked, or Done");
  });
});

describe("setIssueStatus verification and update failures", () => {
  it("throws without a false success log when the read-back does not match", () => {
    const state = { status: "Todo" };
    const runGh = createRunGh(state);
    let projectReads = 0;
    runGh.mockImplementation((args) => {
      if (args[0] === "project" && ++projectReads === 2)
        return JSON.stringify({
          items: [
            {
              id: "item-id",
              status: "Blocked",
              content: { number: 205, repository: options.repo },
            },
          ],
        });
      return createRunGh(state)(args);
    });
    const log = vi.fn();
    expect(() => setIssueStatus(options, { runGh, log })).toThrow(
      "Project Status verification failed",
    );
    expect(log).not.toHaveBeenCalled();
  });

  it("propagates a Status update failure without logging success", () => {
    const state = { status: "Todo", failStatusUpdate: true };
    const runGh = createRunGh(state);
    const log = vi.fn();
    expect(() => setIssueStatus(options, { runGh, log })).toThrow("status update failed");
    expect(log).not.toHaveBeenCalled();
  });
});

describe("setIssueStatus dry-run", () => {
  it("does not run update commands in dry-run mode", () => {
    const runGh = createRunGh({ status: "Todo" });
    const log = vi.fn();
    setIssueStatus({ ...options, dryRun: true }, { runGh, log });
    expect(runGh).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      "[dry-run] reitojike/stage-tracker#205: Project Status -> In Progress (75a98976)",
    );
    expect(log).toHaveBeenCalledWith("[dry-run] no GitHub data was changed");
  });
});

describe("runSetIssueStatusCommand", () => {
  it("does not resolve or execute GitHub CLI for dry-run", () => {
    const exists = vi.fn(() => false);
    const execute = vi.fn(() => "");
    runSetIssueStatusCommand(["--issue", "205", "--status", "Done", "--dry-run"], {
      configuredPath: undefined,
      platform: "linux",
      exists,
      execute,
      log: vi.fn(),
    });
    expect(exists).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("logs the OK message with the resolved Status name after the update", () => {
    const state = { status: "Todo" };
    const log = vi.fn();
    runSetIssueStatusCommand(["--issue", "205", "--status", "Done"], {
      configuredPath: "/usr/bin/gh",
      platform: "linux",
      exists: () => true,
      execute: (_path: string, args: string[]) => createRunGh(state)(args),
      log,
    });
    expect(log).toHaveBeenCalledWith(
      "OK: reitojike/stage-tracker#205 のProject Status -> Done に更新しました",
    );
  });
});
