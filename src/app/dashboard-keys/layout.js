import { connection } from "next/server";

// Like the admin dashboard, never serve year-cached HTML referencing old CSS
// chunks after deployment. Authentication stays in the existing guard/API.
export default async function KeyDashboardRootLayout({ children }) {
  await connection();
  return children;
}
