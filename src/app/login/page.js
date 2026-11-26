"use client";

import dynamic from "next/dynamic";
import PageLoadBadge from "@/shared/components/PageLoadBadge";
import { prefetchLoginStats } from "./loginStats";

// Fire the public stats requests while the login bundle is still loading.
prefetchLoginStats();

const LoginForm = dynamic(() => import("./LoginForm"), {
  ssr: false,
  loading: () => null,
});

export default function LoginPage() {
  return (
    <>
      <LoginForm />
      <PageLoadBadge variant="antares" />
    </>
  );
}
