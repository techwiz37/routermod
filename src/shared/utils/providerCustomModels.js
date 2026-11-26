function modelType(model) {
  return model?.kind || model?.type || "llm";
}

export function applyQoderModelNames(models, customModels, providerAlias) {
  if (providerAlias !== "qd" && providerAlias !== "qdcn") return models;
  const names = new Map(customModels
    .filter((model) => model.providerAlias === providerAlias && modelType(model) === "llm" && model.name && model.name !== model.id)
    .map((model) => [model.id, model.name]));
  return models.map((model) => names.has(model.id) ? { ...model, name: names.get(model.id) } : model);
}

export function getProviderCustomModelRows({
  customModels = [],
  modelAliases = {},
  providerAlias,
  builtInModels = [],
  type = "llm",
  includeLegacyAliases = true,
  includeBuiltInCustomModels = false,
}) {
  const builtInIds = new Set(builtInModels.map((model) => model.id));
  const seenRows = new Set();
  const rows = [];

  for (const model of customModels) {
    if (!model?.id || model.providerAlias !== providerAlias) continue;
    const rowType = modelType(model);
    if (type && rowType !== type) continue;
    if (builtInIds.has(model.id) && !includeBuiltInCustomModels) continue;

    const fullModel = `${providerAlias}/${model.id}`;
    const rowKey = `custom:${fullModel}`;
    if (seenRows.has(rowKey)) continue;
    seenRows.add(rowKey);
    rows.push({
      id: model.id,
      name: model.name || model.id,
      fullModel,
      source: "custom",
      type: rowType,
      ...(model.caps && typeof model.caps === "object" ? { caps: model.caps } : {}),
      ...(model.isFree === true ? { isFree: true } : {}),
    });
  }

  if (!includeLegacyAliases) return rows;

  const prefix = `${providerAlias}/`;
  for (const [alias, fullModel] of Object.entries(modelAliases || {})) {
    if (typeof fullModel !== "string" || !fullModel.startsWith(prefix)) continue;
    const id = fullModel.slice(prefix.length);
    // A legacy alias may intentionally point at a built-in model. It is still
    // its own public row and must remain editable/deletable independently.
    if (!id) continue;
    const rowKey = `alias:${alias}`;
    if (seenRows.has(rowKey)) continue;

    seenRows.add(rowKey);
    rows.push({
      id,
      alias,
      fullModel: alias,
      canonicalModel: fullModel,
      source: "legacyAlias",
      type: type || "llm",
    });
  }

  return rows;
}
