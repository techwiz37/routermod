"use client";

import dynamic from "next/dynamic";
import AppPreloader from "@/shared/components/AppPreloader";

const DashboardLayout = dynamic(
  () => import("@/shared/components/layouts/DashboardLayout"),
  {
    ssr: false,
    loading: () => <AppPreloader />,
  }
);

export default function DashboardRootLayout({ children }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
