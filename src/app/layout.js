import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import { ThemeProvider } from "@/shared/components/ThemeProvider";
import "@/lib/network/initOutboundProxy"; // Auto-initialize outbound proxy env
import "@/shared/services/bootstrap"; // Auto-run initializeApp (watchdog, auto-resume tunnel)
import { initConsoleLogCapture } from "@/lib/consoleLogBuffer";
import { RuntimeI18nProvider } from "@/i18n/RuntimeI18nProvider";
import { PagePreloader } from "@/shared/components/PageLoadBadge";
import { PageReadyProvider } from "@/shared/components/PageReadyContext";

initConsoleLogCapture();

const orbitron      = { variable: "--font-terminator" };
const chakraPetch   = { variable: "--font-ui" };
const jetbrainsMono = { variable: "--font-mono" };
const inter         = { variable: "--font-inter" };

export const metadata = {
  title: "RouterMod - AI Infrastructure Management",
  description: "One endpoint for all your AI providers. Manage keys, monitor usage, and scale effortlessly.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.svg",
    apple: "/icons/icon-192.svg",
  },
};

export const viewport = {
  themeColor: "#08090a",
  colorScheme: "dark",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script src="/load-fonts.js" defer />
        {/* Preload the local icon font so ligatures never flash as raw text. */}
        <link
          rel="preload"
          href="/fonts/material-symbols-outlined.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <noscript>
          <style>{`html .material-symbols-outlined { visibility: visible !important; }`}</style>
        </noscript>
        {/* UI fonts are self-hosted in /fonts (see globals.css) so page render
            never waits on an external font CDN. */}
      </head>
      <body
        suppressHydrationWarning
        className={`${orbitron.variable} ${chakraPetch.variable} ${jetbrainsMono.variable} ${inter.variable} font-sans antialiased`}
      >
        <ThemeProvider>
          <RuntimeI18nProvider>
            <PageReadyProvider>
              <PagePreloader>{children}</PagePreloader>
            </PageReadyProvider>
          </RuntimeI18nProvider>
        </ThemeProvider>
        <GoogleAnalytics gaId={"G-LC959F603F"} />
      </body>
    </html>
  );
}
