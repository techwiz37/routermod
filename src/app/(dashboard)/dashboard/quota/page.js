import { Suspense } from "react";
import QuotaPageClient from "./QuotaPageClient";
import { CardSkeleton } from "@/shared/components/Loading";

export default function QuotaPage() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <QuotaPageClient />
    </Suspense>
  );
}
