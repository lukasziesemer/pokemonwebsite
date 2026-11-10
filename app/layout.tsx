import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navigation from "@/components/Navigation";
import BottomNavigation from "@/components/BottomNavigation";
import { SpriteProvider } from "@/lib/contexts/SpriteContext";
import { EventProvider } from "@/lib/contexts/EventContext";
import EventOverlay from "@/components/EventOverlay";
import { getSession } from "@/lib/auth";
import { AuthProvider } from "@/lib/contexts/AuthContext";

// The root shell reads the session cookie. Marking it explicitly dynamic keeps
// Next.js from attempting static prerendering and swallowing cookie/DB signals
// during the production build.
export const dynamic = "force-dynamic";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: 'swap',
});

export const metadata: Metadata = {
  title: "PokéTool by Lukas",
  description: "Dokumentation eines Parallel-Playthroughs",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();

  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" sizes="any" />
        <link rel="icon" href="/favicon.png" type="image/png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/favicon.svg" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const stored = localStorage.getItem('theme');
                const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                const theme = stored || (systemPrefersDark ? 'dark' : 'light');
                if (theme === 'dark') {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${inter.variable} font-sans antialiased`}
      >
        <AuthProvider initialSession={{
          isAdmin: session.isAdmin,
          username: session.username ?? null,
        }}>
          <SpriteProvider>
            <EventProvider>
              <a
                href="#main-content"
                className="fixed left-3 top-3 z-[100] -translate-y-20 bg-[var(--brand-navy)] px-4 py-2 text-sm font-bold text-white focus:translate-y-0"
              >
                Zum Inhalt
              </a>
              <Navigation />
              <main id="main-content" className="min-h-[calc(100svh-58px)] pb-16 md:min-h-[calc(100svh-61px)] md:pb-0">
                {children}
              </main>
              <BottomNavigation />
              <EventOverlay />
            </EventProvider>
          </SpriteProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
