



export const KEY_ACCESS_MAX_ENTRIES = 200;
export const KEY_ACCESS_MAX_ENTRY_LENGTH = 256;


export const KEY_ACCESS_UNRESTRICTED = Object.freeze({ restricted: false, allow: Object.freeze([]) });


export const KEY_ACCESS_PROVIDER_AS_MODEL_KINDS = Object.freeze(["webSearch", "webFetch"]);


export const KEY_ACCESS_COMBO_OWNER = "combo";


export function keyAccessDeniedMessage(requested) {
  return `This API key is not allowed to use model "${requested}"`;
}
