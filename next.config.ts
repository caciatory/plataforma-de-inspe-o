import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fix 1 (final-review): default 1MB body limit rejects the whole Server Action
  // request (all tabs, not just the photo) once a real phone photo (2-8MB) is
  // attached via the Equipamentos tab's <input type="file">.
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
};

export default nextConfig;
