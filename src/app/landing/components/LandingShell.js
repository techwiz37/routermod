"use client";

import StarField from "@/shared/components/StarField";
import Navigation from "./Navigation";
import LandingSidebar from "./LandingSidebar";
import Footer from "./Footer";
import { LandingLocaleProvider } from "../LandingLocaleContext";

/** Shared public-page shell: top bar on small screens, sidebar on desktop. */
export default function LandingShell({ children }) {
  return (
    <LandingLocaleProvider>
      <div className="an-scope login-skin lf-root landing-root" data-i18n-skip="true">
        <div className="login-bg">
          <StarField />
          <div className="login-fade" />
        </div>
        <LandingSidebar />
        <div className="landing-main relative z-10">
          <Navigation />
          <main>{children}</main>
          <Footer />
        </div>
      </div>
    </LandingLocaleProvider>
  );
}
