import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { THEME_IDS } from "@/lib/themes";
import { GeistSans } from 'geist/font/sans';

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Torvaix",
  description: "A local-first AI workspace: chat, memory, agents and automations that run on your computer. No telemetry.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="scroll-smooth scroll-pt-24">
      <body
        className={`${GeistSans.variable} ${inter.variable} ${jetbrainsMono.variable} ${spaceGrotesk.variable} font-sans antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="dark"
          enableSystem
          // Each theme sets its own color-scheme in themes.css.
          enableColorScheme={false}
          // Switching themes repaints everything at once instead of animating every colour.
          disableTransitionOnChange
          themes={THEME_IDS}
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
