import { redirect } from "next/navigation";

// The public entry point is the landing page. Visitors reach the dashboard
// through the "Masuk" action, which goes to /login first.
export default function InitPage() {
  redirect("/landing");
}
