import { resolveProviderId } from "../constants/providers.js";

export function modelTestKey(model, kind = "llm") {
  const slash = model.indexOf("/");
  const canonical = slash > 0
    ? `${resolveProviderId(model.slice(0, slash)) || model.slice(0, slash)}/${model.slice(slash + 1)}`
    : model;
  return JSON.stringify([kind || "llm", canonical]);
}
