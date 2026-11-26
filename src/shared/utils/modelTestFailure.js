export function isClientPolicyFailure(result) {
  return result?.ok !== true && (
    result?.errorCode === "client_not_allowed" ||
    /\bclient_not_allowed\b/i.test(result?.error || "")
  );
}
