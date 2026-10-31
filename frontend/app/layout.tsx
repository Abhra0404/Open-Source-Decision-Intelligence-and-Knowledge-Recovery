import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "METIS — Decision Intelligence",
  description: "Remember the Why. Understand the Evolution.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
