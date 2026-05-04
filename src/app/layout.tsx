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
  weight: ["400", "500"],
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
    >
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
