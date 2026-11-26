export default function LoadingProvider() {
  return (
    <div role="status" aria-label="Loading provider" className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
      <div className="h-5 w-36 animate-pulse rounded bg-sidebar" />
      <div className="h-12 w-56 animate-pulse rounded bg-sidebar" />
      <div className="h-48 animate-pulse rounded-lg border border-border bg-surface" />
    </div>
  );
}
