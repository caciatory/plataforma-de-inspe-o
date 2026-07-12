import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "Inspecta" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-PT">
      <body>{children}</body>
    </html>
  );
}
