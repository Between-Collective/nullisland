import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Everything runs in the browser, so the whole app ships as static files and
  // can be hosted anywhere.
  output: "export",
};

export default nextConfig;
