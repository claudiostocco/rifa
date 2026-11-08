import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Desenv acessado via 127.0.0.1 nos testes E2E (Playwright)
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    remotePatterns: [
      {
        // CDN do Supabase Storage (bucket premios — SPEC §2.6 next.config.mjs)
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
