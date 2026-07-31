import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const title = "map/data — broken geospatial test fixtures";
const description =
  "Generate deliberately broken map files — GeoJSON, KML, KMZ, GPX, CSV, WKT, TopoJSON, Shapefile — to test how your map handles the edge cases before your users find them.";

export const metadata: Metadata = {
  title,
  description,
  applicationName: "map/data",
  keywords: [
    "geojson", "test data", "fixtures", "shapefile", "kml", "gpx",
    "topojson", "wkt", "geospatial", "map testing", "edge cases",
  ],
  openGraph: { title, description, type: "website" },
  twitter: { card: "summary", title, description },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
