"use client";

import dynamic from "next/dynamic";
import PageLoadBadge from "@/shared/components/PageLoadBadge";
import AppPreloader from "@/shared/components/AppPreloader";

const LoginForm = dynamic(() => import("./LoginForm"), {
  ssr: false,
  loading: () => <AppPreloader />,
});

export default function LoginPage() {
  return (
    <>
      <LoginForm />
      <PageLoadBadge />
    </>
  );
}
