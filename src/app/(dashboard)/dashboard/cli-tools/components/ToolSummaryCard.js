"use client";

import Link from "next/link";
import Image from "next/image";

function getStatus(status, tool) {
  if (tool?.configType === "guide") return { label: "Guide", tone: "accent" };
  if (!status) return { label: "Unknown", tone: "" };
  if (!status.installed) return { label: "Not installed", tone: "" };
  if (status.has9Router) return { label: "Connected", tone: "ok" };
  return { label: "Not configured", tone: "danger" };
}

export default function ToolSummaryCard({ toolId, tool, status }) {
  const s = getStatus(status, tool);
  return (
    <Link href={`/dashboard/cli-tools/${toolId}`} className="group block h-full">
      <article className="an-pcard h-full cursor-pointer">
        <div className="flex h-full flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="an-conn-ico !size-9 !w-9 !h-9 !rounded-[10px]">
              {tool.image ? (
                <Image src={tool.image} alt={tool.name} width={32} height={32} className="size-8 object-contain rounded-lg" sizes="32px" onError={(e) => { e.target.style.display = "none"; }} loading="lazy" decoding="async" />
              ) : tool.icon ? (
                <span className="material-symbols-outlined text-[28px]" style={{ color: tool.color }}>{tool.icon}</span>
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="an-conn-name">{tool.name}</h3>
              <div className="an-conn-chips">
                <span className={`an-chip ${s.tone}`}>{s.label}</span>
              </div>
            </div>
            <span className="material-symbols-outlined text-[18px] text-[var(--t-dim)] group-hover:text-[var(--t-star-ink)] transition-colors shrink-0">
              chevron_right
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
