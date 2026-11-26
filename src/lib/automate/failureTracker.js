import { getAutomateConfig, recordFailure, getRecentFailures } from "@/lib/db/repos/automateRepo";
import { updateProviderConnection } from "@/lib/localDb";
import { enqueueWhatsAppMessage } from "./whatsappQueue.js";
import { formatNotificationTime } from "./notificationFormat.js";
import { resolveProviderId } from "@/shared/constants/providers.js";
import { KIRO_LIMIT_REACTIVATION_MS, KIRO_LIMIT_REACTIVATION_FIELD } from "open-sse/config/errorConfig.js";

// One alert per model/connection when it crosses the threshold. Without this
// cooldown every additional failure re-sends the same "auto-disabled" alert.
const NOTIFY_COOLDOWN_MS = 10 * 60 * 1000;
const lastNotified = new Map();

const WINDOW_UNIT_LABELS = { minutes: "menit", hours: "jam", days: "hari" };

/** Human-readable time window, e.g. "45 menit", "2 jam", "3 hari". */
function formatWindow(config) {
  const unit = WINDOW_UNIT_LABELS[config.timeWindowUnit] || "jam";
  const value = Number(config.timeWindowValue) || Math.round(Number(config.timeWindowHours) || 1);
  return `${value} ${unit}`;
}

async function sendWhatsAppNotification(recipient, message) {
  try {
    enqueueWhatsAppMessage(recipient, message);
    return true;
  } catch (error) {
    console.error("[AUTOMATE] Failed to enqueue WhatsApp notification:", error.message);
    return false;
  }
}

async function sendTelegramNotification(botToken, chatId, message) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "Markdown",
      }),
    });
    const data = await response.json();
    return data.ok;
  } catch (error) {
    console.error("Failed to send Telegram notification:", error);
    return false;
  }
}

export async function trackModelFailure(provider, model, connectionId, error) {
  try {
    const config = await getAutomateConfig();
    
    if (!config.enabled) return;

    await recordFailure(provider, model, connectionId, error);

    const recentFailures = await getRecentFailures(provider, model, config.timeWindowHours);

    // Notify only on the failure that actually crosses the threshold, and
    // never twice for the same model within the cooldown window.
    if (recentFailures.length === config.failureThreshold) {
      const notifyKey = `${provider}|${model}|${connectionId}`;
      const now = Date.now();
      if (now - (lastNotified.get(notifyKey) || 0) < NOTIFY_COOLDOWN_MS) return;
      lastNotified.set(notifyKey, now);
      console.log(`[AUTOMATE] Model ${provider}/${model} mencapai threshold: ${recentFailures.length} failures dalam ${formatWindow(config)}`);

      if (connectionId) {
        try {
          const patch = { isActive: false };
          // Kiro accounts disabled by repeated limit failures rejoin rotation
          // after 24h; the background health tick reads this stamp.
          if (resolveProviderId(provider) === "kiro") {
            patch[KIRO_LIMIT_REACTIVATION_FIELD] = new Date(Date.now() + KIRO_LIMIT_REACTIVATION_MS).toISOString();
          }
          await updateProviderConnection(connectionId, patch);
          console.log(`[AUTOMATE] Connection ${connectionId} (${provider}/${model}) telah di-disable`);

          if (config.notifyOnDisable !== false) {
            const message = `⚠️ *RouterMod Auto-Disable*\n\n` +
              `*Provider:* \`${provider}\`\n` +
              `*Model:* \`${model}\`\n` +
              `*Connection ID:* \`${connectionId}\`\n\n` +
              `🚫 Model telah di-disable karena mencapai ${recentFailures.length} kegagalan dalam ${formatWindow(config)} terakhir.\n\n` +
              `_${formatNotificationTime()}_`;

            if (config.telegramBotToken && config.telegramChatId) {
              await sendTelegramNotification(config.telegramBotToken, config.telegramChatId, message);
            }

            if (config.whatsappRecipient) {
              await sendWhatsAppNotification(config.whatsappRecipient, message);
            }
          }
        } catch (err) {
          console.error(`[AUTOMATE] Failed to disable connection ${connectionId}:`, err);
        }
      }
    }
  } catch (error) {
    console.error("[AUTOMATE] trackModelFailure error:", error);
  }
}
