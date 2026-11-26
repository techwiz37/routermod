import { getAdapter } from "./driver.js";

/**
 * Auto-delete expired API keys from database
 */
export async function cleanupExpiredKeys() {
  try {
    const db = await getAdapter();
    const now = new Date().toISOString();
    
    // Get expired keys
    const expiredKeys = db.all(
      `SELECT id, name, key FROM apiKeys WHERE expiresAt IS NOT NULL AND expiresAt < ?`,
      [now]
    );
    
    if (!expiredKeys || expiredKeys.length === 0) {
      return 0;
    }
    
    // Delete expired keys
    let deletedCount = 0;
    for (const key of expiredKeys) {
      db.run(`DELETE FROM apiKeys WHERE id = ?`, [key.id]);
      deletedCount++;
      const keyShort = key.key?.substring(0, 20) || 'N/A';
      console.log(`[Cleanup] Deleted expired key: ${key.name} (${keyShort}...)`);
    }
    
    console.log(`[Cleanup] Total expired keys deleted: ${deletedCount}`);
    return deletedCount;
  } catch (error) {
    console.error(`[Cleanup] Error deleting expired keys:`, error);
    return 0;
  }
}

/**
 * Start periodic cleanup job - runs every hour
 */
export function startExpiredKeysCleanup() {
  // Run immediately on start
  cleanupExpiredKeys().catch(console.error);
  
  // Then run every hour
  const INTERVAL_MS = 60 * 60 * 1000; // 1 hour
  setInterval(() => {
    cleanupExpiredKeys().catch(console.error);
  }, INTERVAL_MS);
  
  console.log('[Cleanup] Expired keys auto-cleanup started (runs every hour)');
}
