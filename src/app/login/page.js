"use client";

import dynamic from "next/dynamic";
import PageLoadBadge from "@/shared/components/PageLoadBadge";

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
