import sqlite3
from datetime import datetime, timezone
import sys

def cleanup_expired_keys():
    """Delete API keys that have passed their expiration date"""
    try:
        conn = sqlite3.connect('/root/.routermod/db/routermod.sqlite')
        cursor = conn.cursor()
        
        # Get expired keys
        now = datetime.now(timezone.utc).isoformat()
        cursor.execute("""
            SELECT id, name, key FROM apiKeys 
            WHERE expiresAt IS NOT NULL 
            AND expiresAt < ?
        """, (now,))
        
        expired_keys = cursor.fetchall()
        
        if not expired_keys:
            print(f"[{datetime.now().isoformat()}] No expired keys found")
            return 0
        
        # Delete expired keys
        deleted_count = 0
        for key_id, name, key_prefix in expired_keys:
            cursor.execute("DELETE FROM apiKeys WHERE id = ?", (key_id,))
            deleted_count += 1
            key_short = key_prefix[:20] + '...' if key_prefix else 'N/A'
            print(f"[{datetime.now().isoformat()}] Deleted expired key: {name} ({key_short})")
        
        conn.commit()
        conn.close()
        
        print(f"[{datetime.now().isoformat()}] Total keys deleted: {deleted_count}")
        return deleted_count
        
    except Exception as e:
        print(f"[{datetime.now().isoformat()}] ERROR: {e}", file=sys.stderr)
        return 0

if __name__ == "__main__":
    cleanup_expired_keys()
