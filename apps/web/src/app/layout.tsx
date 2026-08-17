import type { Metadata } from "next";
import { Host_Grotesk, Geist_Mono } from "next/font/google";
import "./globals.css";

const host = Host_Grotesk({ variable: "--font-host", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono-face", subsets: ["latin"] });

const title = "Null Island — broken geospatial test fixtures";
const description =
  "Generate deliberately broken map files — GeoJSON, KML, KMZ, GPX, CSV, WKT, TopoJSON, Shapefile — to test how your map handles the edge cases before your users find them.";

export const metadata: Metadata = {
  title,
  description,
  applicationName: "Null Island",
  metadataBase: new URL("https://nullisland.app"),
  keywords: [
    "geojson", "test data", "fixtures", "shapefile", "kml", "gpx",
    "topojson", "wkt", "geospatial", "map testing", "edge cases",
  ],
  openGraph: { title, description, type: "website" },
  twitter: { card: "summary", title, description },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${host.variable} ${mono.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
