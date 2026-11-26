"use client";

import { useModelCaps } from "@/shared/hooks/useModelCaps";
import CapacityBadges from "./CapacityBadges";

export default function ModelCapabilities({ model, caps, size = 14 }) {
  const { getCaps } = useModelCaps();
  return <CapacityBadges caps={{ ...getCaps(model), ...caps }} size={size} showAll />;
}
