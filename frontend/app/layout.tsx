import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tattoo Workbench",
  description: "From reference to tattoo-ready.",
  applicationName: "Tattoo Workbench",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Tattoo Workbench" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#080a16" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
