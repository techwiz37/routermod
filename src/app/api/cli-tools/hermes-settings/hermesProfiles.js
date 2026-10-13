

import fs from "fs/promises";
import path from "path";
import os from "os";
import { parseModelBlock, parseDelegationBlock, parseAuxRoles, has9RouterConfig } from "./hermesYaml.js";


export const PROFILE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
export const IDENTITY_FILES = ["config.yaml", ".env", "SOUL.md", "profile.yaml", "auth.json", "state.db"];

export const getHermesRoot = (root) => root || path.join(os.homedir(), ".hermes");
export const getProfilesRoot = (root) => path.join(getHermesRoot(root), "profiles");

export const isValidProfileName = (name) =>
  typeof name === "string" && PROFILE_NAME_RE.test(name) && name.toLowerCase() !== "default";


export const resolveHermesHome = (profile, root) => {
  const base = getHermesRoot(root);
  const name = typeof profile === "string" ? profile.trim() : "";
  if (!name || name === "default") {
    return { name: "default", dir: base, configPath: path.join(base, "config.yaml"), envPath: path.join(base, ".env"), isDefault: true };
  }
  if (!isValidProfileName(name)) {
    throw new Error("Invalid Hermes profile name (letters, digits, - and _ only, max 64 chars)");
  }
  const profilesRoot = path.resolve(getProfilesRoot(base));
  const dir = path.resolve(path.join(profilesRoot, name));
  if (dir !== profilesRoot && !dir.startsWith(profilesRoot + path.sep)) {
    throw new Error("Invalid Hermes profile path");
  }
  return { name, dir, configPath: path.join(dir, "config.yaml"), envPath: path.join(dir, ".env"), isDefault: false };
};

export const dirExists = async (dir) => {
  try {
    const st = await fs.stat(dir);
    return st.isDirectory();
  } catch {
    return false;
  }
};


export const isProfileHome = async (dir) => {
  for (const file of IDENTITY_FILES) {
    try {
      await fs.stat(path.join(dir, file));
      return true;
    } catch {

    }
  }
  return false;
};

const readText = async (file) => {
  try {
    return await fs.readFile(file, "utf-8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
};


const parseDisplayName = (yaml) => {
  const m = yaml.match(/^display_name:[ \t]*["']?([^"'\r\n]+)["']?/m);
  return m ? m[1].trim() : null;
};

const buildEntry = async (name, dir, isDefault) => {
  const configPath = path.join(dir, "config.yaml");
  const yaml = await readText(configPath);
  const model = parseModelBlock(yaml);
  const delegation = parseDelegationBlock(yaml);
  const auxiliary = parseAuxRoles(yaml);
  const displayName = parseDisplayName(await readText(path.join(dir, "profile.yaml")));
  return {
    name,
    dir,
    isDefault,
    displayName,

    command: isDefault ? "hermes" : `hermes -p ${name}`,
    alias: isDefault ? null : name,
    model: model?.default || null,
    baseUrl: model?.base_url || null,

    has9Router: has9RouterConfig(model) || has9RouterConfig(delegation) || Object.values(auxiliary).some(has9RouterConfig),
  };
};


export const listProfiles = async (root) => {
  const base = getHermesRoot(root);
  const entries = [await buildEntry("default", base, true)];

  let dirents = [];
  try {
    dirents = await fs.readdir(getProfilesRoot(base), { withFileTypes: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return entries;
  }

  const names = dirents
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((n) => isValidProfileName(n))
    .sort((a, b) => a.localeCompare(b));

  for (const name of names) {
    const dir = path.join(base, "profiles", name);
    if (!(await isProfileHome(dir))) continue;
    entries.push(await buildEntry(name, dir, false));
  }
  return entries;
};
