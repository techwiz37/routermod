import DashboardLayout from "@/shared/components/layouts/DashboardLayout";

// The dashboard pages were prerendered and served with
// "Cache-Control: s-maxage=31536000". After a deploy the browser (or the
// Cloudflare edge) kept the old HTML, which pointed at chunks that no longer
// existed - the page then failed with a 500 and an empty UI.
// Rendering the dashboard on every request keeps the HTML in sync with the
// build that is currently deployed.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function DashboardRootLayout({ children }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
