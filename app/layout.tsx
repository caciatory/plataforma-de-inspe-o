import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "Check Auto" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-PT">
      <body>{children}</body>
    </html>
  );
}
