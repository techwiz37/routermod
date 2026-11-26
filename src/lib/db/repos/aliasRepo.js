import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";
import { makeKv } from "../helpers/kvStore.js";

const aliasKv = makeKv("modelAliases");
const customKv = makeKv("customModels");
const mitmKv   = makeKv("mitmAlias");
const nameKv   = makeKv("modelNames"); // key=providerAlias/modelId, value=display name

export async function getModelAliases() {
  return await aliasKv.getAll();
}

export async function setModelAlias(alias, model) {
  await aliasKv.set(alias, model);
}

export async function deleteModelAlias(alias) {
  await aliasKv.remove(alias);
}

// Only public identity changes. Never put the generated ID into the upstream
// model field, and allocate it transactionally so two additions cannot collide.
export async function addModelAliasVariant({ providerAlias, id, prefix }) {
  const db = await getAdapter();
  const target = `${providerAlias}/${id}`;
  let alias;
  db.transaction(() => {
    const used = new Set(db.all("SELECT key FROM kv WHERE scope = 'modelAliases'").map((row) => row.key));
    for (const row of db.all("SELECT value FROM kv WHERE scope = 'customModels'")) {
      const model = parseJson(row.value);
      if (!model?.id) continue;
      used.add(`${prefix}/${model.id}`);
      if (model.name) used.add(model.name.includes("/") ? model.name : `${prefix}/${model.name}`);
    }
    let suffix = 2;
    do { alias = `${prefix}/${id}-custom-${suffix++}`; } while (used.has(alias));
    db.run("INSERT INTO kv(scope, key, value) VALUES('modelAliases', ?, ?)", [alias, stringifyJson(target)]);
  });
  return alias;
}

function customKey(providerAlias, id, type) {
  return `${providerAlias}|${id}|${type}`;
}

export async function getCustomModels() {
  const all = await customKv.getAll();
  return Object.values(all);
}

export async function addCustomModel({ providerAlias, id, type = "llm", name, caps, transport, isFree }) {
  const k = customKey(providerAlias, id, type);
  const db = await getAdapter();
  const freeFlag = typeof isFree === "boolean" ? { isFree } : {};
  let added = false;
  db.transaction(() => {
    const row = db.get(`SELECT value FROM kv WHERE scope = 'customModels' AND key = ?`, [k]);
    if (row) {
      const prev = parseJson(row.value) || {};
      const next = { ...prev, ...(name ? { name } : {}), ...(transport ? { transport } : {}), ...freeFlag };
      // caps semantics: undefined → keep existing; object → replace the
      // override; null → remove it entirely (fall back to catalog defaults).
      if (caps !== undefined) {
        if (caps === null) delete next.caps;
        else next.caps = caps;
      }
      db.run(`UPDATE kv SET value = ? WHERE scope = 'customModels' AND key = ?`, [stringifyJson(next), k]);
      return;
    }
    const value = stringifyJson({ providerAlias, id, type, name: name || id, ...(caps !== undefined && caps !== null ? { caps } : {}), ...(transport ? { transport } : {}), ...freeFlag });
    db.run(`INSERT INTO kv(scope, key, value) VALUES('customModels', ?, ?)`, [k, value]);
    added = true;
  });
  return added;
}

export async function deleteCustomModel({ providerAlias, id, type = "llm" }) {
  await customKv.remove(customKey(providerAlias, id, type));
}

export async function getModelNames() {
  return await nameKv.getAll();
}

export async function setModelName(providerAlias, modelId, name) {
  await nameKv.set(`${providerAlias}/${modelId}`, name);
}

export async function deleteModelName(providerAlias, modelId) {
  await nameKv.remove(`${providerAlias}/${modelId}`);
}

export async function getMitmAlias(toolName) {
  if (toolName) {
    const v = await mitmKv.get(toolName);
    return v || {};
  }
  return await mitmKv.getAll();
}

export async function setMitmAliasAll(toolName, mappings) {
  await mitmKv.set(toolName, mappings || {});
}
