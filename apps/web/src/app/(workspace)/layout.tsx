"use client"

import { AppShell } from "@/components/layout/app-shell";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      {children}
    </AppShell>
  );
}
