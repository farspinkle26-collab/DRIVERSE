import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Driveverse Admin",
  description: "Internal analytics dashboard for Driveverse.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
