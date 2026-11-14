/**
 * Session-based per-model rate limiting for custom providers.
 * 
 * Allows configuring: "model A can be used 10 times per minute per session"
 * Session is identified by sessionId or clientIp.
 * 
 * Config stored in providerNodes.data.modelRateLimits:
 * {
 *   "gpt-4": { maxRequests: 10, windowMinutes: 1 },
 *   "claude-3": { maxRequests: 5, windowMinutes: 5 }
 * }
 */

// In-memory store: Map<sessionKey, Map<modelId, Array<timestamp>>>
const sessionUsage = new Map();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [sessionKey, models] of sessionUsage.entries()) {
    for (const [modelId, timestamps] of models.entries()) {
      // Remove timestamps older than 1 hour
      const filtered = timestamps.filter(ts => now - ts < 3600000);
      if (filtered.length === 0) {
        models.delete(modelId);
      } else {
        models.set(modelId, filtered);
      }
    }
    if (models.size === 0) {
      sessionUsage.delete(sessionKey);
    }
  }
}, 300000);

/**
 * Check if session can use the model, respecting rate limits.
 * 
 * @param {string} sessionId - Session identifier (sessionId or clientIp)
 * @param {string} providerId - Provider node ID
 * @param {string} modelId - Model identifier
 * @param {object} rateLimitConfig - { maxRequests: 10, windowMinutes: 1 }
 * @returns {{ allowed: boolean, reason?: string, resetAt?: Date }}
 */
export function checkSessionModelRateLimit(sessionId, providerId, modelId, rateLimitConfig) {
  if (!rateLimitConfig || !rateLimitConfig.maxRequests || !rateLimitConfig.windowMinutes) {
    return { allowed: true };
  }

  const sessionKey = `${providerId}:${sessionId}`;
  const now = Date.now();
  const windowMs = rateLimitConfig.windowMinutes * 60 * 1000;
  const cutoff = now - windowMs;

  // Get or create session usage map
  if (!sessionUsage.has(sessionKey)) {
    sessionUsage.set(sessionKey, new Map());
  }
  const models = sessionUsage.get(sessionKey);

  // Get or create model usage array
  if (!models.has(modelId)) {
    models.set(modelId, []);
  }
  const timestamps = models.get(modelId);

  // Filter out expired timestamps
  const validTimestamps = timestamps.filter(ts => ts >= cutoff);
  models.set(modelId, validTimestamps);

  // Check if limit exceeded
  if (validTimestamps.length >= rateLimitConfig.maxRequests) {
    const oldestTimestamp = Math.min(...validTimestamps);
    const resetAt = new Date(oldestTimestamp + windowMs);
    return {
      allowed: false,
      reason: `Model "${modelId}" rate limit exceeded for this session: ${rateLimitConfig.maxRequests} requests per ${rateLimitConfig.windowMinutes} minute(s). Try again after ${resetAt.toLocaleTimeString()}.`,
      resetAt,
      current: validTimestamps.length,
      limit: rateLimitConfig.maxRequests,
      windowMinutes: rateLimitConfig.windowMinutes
    };
  }

  return { allowed: true };
}

/**
 * Record a model usage for a session.
 * Call this AFTER request succeeds to increment counter.
 */
export function recordSessionModelUsage(sessionId, providerId, modelId) {
  const sessionKey = `${providerId}:${sessionId}`;
  const now = Date.now();

  if (!sessionUsage.has(sessionKey)) {
    sessionUsage.set(sessionKey, new Map());
  }
  const models = sessionUsage.get(sessionKey);

  if (!models.has(modelId)) {
    models.set(modelId, []);
  }
  const timestamps = models.get(modelId);
  timestamps.push(now);
}

/**
 * Get current usage stats for debugging/display
 */
export function getSessionModelUsage(sessionId, providerId, modelId) {
  const sessionKey = `${providerId}:${sessionId}`;
  if (!sessionUsage.has(sessionKey)) return { count: 0, timestamps: [] };
  
  const models = sessionUsage.get(sessionKey);
  if (!models.has(modelId)) return { count: 0, timestamps: [] };
  
  const timestamps = models.get(modelId);
  return { count: timestamps.length, timestamps: [...timestamps] };
}
