// The key owner can replace their own API key from the Manage Keys page.
// Admins can now opt a key out of that: the key keeps working, but the holder
// cannot rotate it without asking the admin. Default is enabled for every
// existing row so the upgrade changes no behaviour.
export default {
  version: 13,
  name: "api-key-change-key-toggle",
  up(adapter) {
    try {
      adapter.exec("ALTER TABLE apiKeys ADD COLUMN changeKeyEnabled INTEGER DEFAULT 1");
    } catch (error) {
      if (!String(error?.message || error).toLowerCase().includes("duplicate column")) throw error;
    }
    adapter.exec("UPDATE apiKeys SET changeKeyEnabled = 1 WHERE changeKeyEnabled IS NULL");
  },
};
