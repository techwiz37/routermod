import { getCurrentLocale, translate } from "@/i18n/runtime";
import { useNotificationStore } from "@/store/notificationStore";

export function notifyModelTestSuccess(model, latencyMs) {
  const locale = getCurrentLocale();
  const duration = latencyMs < 1000
    ? `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(latencyMs)} ms`
    : translate("{value} seconds").replace("{value}", new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(latencyMs / 1000));

  useNotificationStore.getState().addNotification({
    type: "success",
    title: translate("Model responded successfully"),
    message: translate("{model} responded in {duration}")
      .replace("{model}", model)
      .replace("{duration}", duration),
  });
}
