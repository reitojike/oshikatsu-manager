import { homedir } from "node:os";
import { readFileSync } from "node:fs";

import { resolveTierModel } from "./resolve-codex-tier-lib.mjs";

const usage = () => {
  console.error("usage: node scripts/resolve-codex-tier.mjs <sol|terra|luna>");
};

const tier = process.argv[2];

try {
  const model = resolveTierModel(tier, { env: process.env, homedir, readFileSync });
  console.log(model);
} catch (error) {
  usage();
  console.error(`${error.code ?? "ERROR"}: ${error.message}`);
  process.exitCode = 1;
}
