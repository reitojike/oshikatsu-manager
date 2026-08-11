import { isAbsolute, join } from "node:path";

import { parse } from "smol-toml";

const TIERS = ["sol", "terra", "luna"];
const BOM = "﻿";
const ALLOWED_KEYS = ["model"];

export const CODEX_PROFILE_RESOLUTION_ERROR_NAME = "CodexProfileResolutionError";

export const isCodexProfileResolutionError = (error) =>
  error instanceof Error && error.name === CODEX_PROFILE_RESOLUTION_ERROR_NAME;

const fail = (code, message) => {
  const error = new Error(message);
  error.name = CODEX_PROFILE_RESOLUTION_ERROR_NAME;
  error.code = code;
  throw error;
};

export const isValidTier = (tier) => TIERS.includes(tier);

export const resolveCodexHome = ({ env, homedir }) => {
  const configured = env.CODEX_HOME;
  if (configured === undefined || configured === "") return join(homedir(), ".codex");
  if (!isAbsolute(configured))
    fail("CODEX_HOME_RELATIVE", `CODEX_HOME must be an absolute path, got: ${configured}`);
  return configured;
};

const stripBom = (text) => (text.startsWith(BOM) ? text.slice(BOM.length) : text);

const readProfileText = ({ tier, codexHome, readFileSync }) => {
  const path = join(codexHome, `${tier}.config.toml`);
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") fail("FILE_MISSING", `profile not found: ${path}`);
    fail("FILE_UNREADABLE", `profile could not be read: ${path}; ${error?.message ?? error}`);
  }
  return undefined;
};

const parseProfileText = (text, path) => {
  try {
    return parse(stripBom(text));
  } catch (error) {
    fail("TOML_PARSE_ERROR", `profile is not valid TOML: ${path}; ${error?.message ?? error}`);
  }
  return undefined;
};

const validateProfile = (profile, path) => {
  const unsupported = Object.keys(profile).filter((key) => !ALLOWED_KEYS.includes(key));
  if (unsupported.length > 0)
    fail(
      "UNSUPPORTED_PROFILE_KEY",
      `profile has unsupported key(s): ${unsupported.join(", ")} (${path})`,
    );
  if (typeof profile.model !== "string" || profile.model.trim() === "")
    fail("MODEL_KEY_MISSING", `profile is missing a non-empty "model" string: ${path}`);
};

export const resolveTierModel = (tier, { env, homedir, readFileSync }) => {
  if (!isValidTier(tier))
    fail("UNKNOWN_TIER", `tier must be one of ${TIERS.join(", ")}, got: ${tier}`);
  const codexHome = resolveCodexHome({ env, homedir });
  const path = join(codexHome, `${tier}.config.toml`);
  const text = readProfileText({ tier, codexHome, readFileSync });
  const profile = parseProfileText(text, path);
  validateProfile(profile, path);
  return profile.model;
};
