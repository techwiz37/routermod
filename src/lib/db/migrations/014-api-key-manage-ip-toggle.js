// Admins can stop a key owner from editing their own IP blacklist while still
// letting them see the recorded addresses. Default is enabled so existing keys
// behave exactly as before the upgrade.
export default {
  version: 14,
  name: "api-key-manage-ip-toggle",
  up(adapter) {
    try {
      adapter.exec("ALTER TABLE apiKeys ADD COLUMN manageIpEnabled INTEGER DEFAULT 1");
    } catch (error) {
      if (!String(error?.message || error).toLowerCase().includes("duplicate column")) throw error;
    }
    adapter.exec("UPDATE apiKeys SET manageIpEnabled = 1 WHERE manageIpEnabled IS NULL");
  },
};
