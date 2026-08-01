import type { Metadata } from "next";
import { Playfair_Display, Source_Serif_4, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["700", "900"],
  variable: "--font-display",
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["300", "400", "600"],
  variable: "--font-body",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  // "700" added for the PRESS WIRE ticker (breaking-ticker.tsx): its
  // font-weight:700 needs a true bold face, not browser-synthesized bold —
  // the WCAG large-text contrast pass on cream-on-orange (3.011:1) depends
  // on rendering as genuinely bold, not just fatter via faux-bold skew.
  weight: ["400", "500", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sandbox Daily — News · Tech · Sport",
  description:
    "The intelligence of a broadsheet, the urgency of a live broadcast, the data depth of a financial terminal.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${sourceSerif.variable} ${ibmPlexMono.variable}`}
      // data-theme is stamped by the inline script below BEFORE hydration, so
      // the server HTML (no attribute) and the client's first paint disagree
      // on purpose — suppress the attribute-mismatch warning for this element.
      suppressHydrationWarning
    >
      <head>
        {/* Pre-paint theme stamp: runs before first paint so a night-edition
            reader never gets a flash of vellum. localStorage beats the OS
            preference; ThemeToggle keeps both in sync from then on. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("sd-theme");if(t!=="dark"&&t!=="light")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body className="bg-cream text-ink antialiased">
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:bg-ink focus:text-cream focus:px-4 focus:py-2 focus:rounded-sharp font-mono text-meta uppercase tracking-mono-wide"
          >
            Skip to content
          </a>
          <Nav />
          <main id="main-content" className="pt-16">{children}</main>
          <Footer />
        </body>
    </html>
  );
}
