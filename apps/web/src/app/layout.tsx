import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Growth OS SaaS",
  description: "Multi-tenant marketing operating system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark">
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  );
}

