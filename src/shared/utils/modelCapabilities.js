// Preserve explicit upstream booleans, including false. Absence means that
// catalog inference (or a manual override) should decide the capability.
export function importedModelCaps(model) {
  if (!model || typeof model !== "object") return undefined;
  const caps = {};
  const sources = [model, model.capabilities, model.caps];
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    for (const [key, aliases] of Object.entries({
      vision: ["supports_vision", "supports_images", "supportsVision", "isVL", "vision"],
      reasoning: ["supports_reasoning", "supports_thinking", "supportsReasoning", "isReasoning", "thinking", "reasoning"],
    })) {
      for (const alias of aliases) if (typeof source[alias] === "boolean") caps[key] = source[alias];
    }
  }
  if (Array.isArray(model.capabilities)) {
    if (model.capabilities.some((key) => ["vision", "image", "image_input"].includes(key))) caps.vision ??= true;
    if (model.capabilities.some((key) => ["reasoning", "thinking"].includes(key))) caps.reasoning ??= true;
  }
  const input = model.architecture?.input_modalities || model.input_modalities;
  if (caps.vision === undefined && Array.isArray(input)) caps.vision = input.includes("image");
  const parameters = model.supported_parameters;
  if (caps.reasoning === undefined && Array.isArray(parameters)) {
    if (parameters.some((key) => ["reasoning", "reasoning_effort", "thinking"].includes(key))) caps.reasoning = true;
  }
  return Object.keys(caps).length ? caps : undefined;
}
