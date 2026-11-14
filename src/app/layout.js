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
        {/* Google Fonts loaded at runtime (not build-time) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600&family=Orbitron:wght@700;800;900&family=Chakra+Petch:wght@400;600;700&family=JetBrains+Mono:wght@400;500;700&family=Inter:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
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
