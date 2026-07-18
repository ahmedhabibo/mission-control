import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import Link from "next/link";
import { LineChart, Settings, MessageSquare, ListChecks, Activity, Box } from "lucide-react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mission Control — Agent OS",
  description: "Status board for the AI tool stack: Hermes, Opencode, Mistral Vibe, Paseo.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur">
            <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-6">
              <Link href="/" className="flex items-center gap-2 font-semibold">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--accent)] text-[var(--accent-foreground)]">
                  <Activity className="h-4 w-4" />
                </span>
                <span>
                  Mission Control
                  <span className="ml-2 text-xs font-normal text-[var(--muted-foreground)]">
                    Agent OS
                  </span>
                </span>
              </Link>
              <nav className="ml-auto flex items-center gap-1">
                <Link
                  href="/dashboard"
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  <LineChart className="h-3.5 w-3.5" />
                  Dashboard
                </Link>
                <Link
                  href="/arena"
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  <Box className="h-3.5 w-3.5" />
                  Arena
                </Link>
                <Link
                  href="/status"
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  <Activity className="h-3.5 w-3.5" />
                  Status
                </Link>
                <Link
                  href="/chat"
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Chat
                </Link>
                <Link
                  href="/tasks"
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  <ListChecks className="h-3.5 w-3.5" />
                  Tasks
                </Link>
                <Link
                  href="/orchestration"
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  <Activity className="h-3.5 w-3.5" />
                  Orchestration
                </Link>
                <Link
                  href="/settings"
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  <Settings className="h-3.5 w-3.5" />
                  Settings
                </Link>
              </nav>
            </div>
          </header>
          <main className="flex-1">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
