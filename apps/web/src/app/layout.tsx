import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { HackerLoader } from "@/components/ui/hacker-loader";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Torvaix",
  description: "Workspace-first AI Operating System — Local-first, privacy-first, no telemetry.",
  icons: {
    icon: [
      {
        url: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect x='25' y='25' width='50' height='50' rx='8' transform='rotate(45 50 50)' fill='%23e06c75'/><rect x='37' y='37' width='26' height='26' rx='4' transform='rotate(45 50 50)' fill='%231c2128'/></svg>",
        type: "image/svg+xml",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="scroll-smooth scroll-pt-24">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          themes={['dark', 'light', 'cyberpunk', 'aurora', 'terminal']}
        >
          <HackerLoader />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
