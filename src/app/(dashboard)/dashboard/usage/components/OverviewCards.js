"use client";

import PropTypes from "prop-types";
import { translate } from "@/i18n/runtime";
import AntaresStat from "@/shared/components/AntaresStat";

const fmt = (n) => {
  const num = n || 0;
  if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
  return new Intl.NumberFormat().format(num);
};
const fmtCost = (n) => `$${(n || 0).toFixed(2)}`;

export default function OverviewCards({ stats }) {
  const input = stats.totalPromptTokens || 0;
  const cached = stats.totalCachedTokens || 0;
  const output = stats.totalCompletionTokens || 0;
  const totalTokens = input + cached + output;
  const share = (n) => (totalTokens > 0 ? Math.round((n / totalTokens) * 100) : 0);

  return (
    <div className="an-grid gap-2.5 sm:gap-3">
      <AntaresStat
        label={translate("Total Requests")}
        icon="swap_horiz"
        tone="default"
        value={fmt(stats.totalRequests)}
        foot={translate("total requests recorded")}
      />
      <AntaresStat
        label={translate("Input Tokens")}
        icon="input"
        tone="violet"
        value={fmt(input)}
        foot={`${share(input)}% ${translate("of total tokens")}`}
      />
      <AntaresStat
        label={translate("Cache Tokens")}
        icon="offline_bolt"
        tone="ok"
        value={fmt(cached)}
        foot={`${share(cached)}% ${translate("of total tokens")}`}
      />
      <AntaresStat
        label={translate("Output Tokens")}
        icon="output"
        tone="default"
        value={fmt(output)}
        foot={`${share(output)}% ${translate("of total tokens")}`}
      />
      <AntaresStat
        label={translate("Estimated Cost")}
        icon="attach_money"
        tone="warn"
        value={`~${fmtCost(stats.totalCost)}`}
        foot={translate("Token rate estimate")}
        className="col-span-2 sm:col-span-1"
      />
    </div>
  );
}

OverviewCards.propTypes = {
  stats: PropTypes.object.isRequired,
};
