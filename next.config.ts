import type { NextConfig } from "next";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // CDP loads optional x402 adapters dynamically. Keep the Node SDK external so
  // webpack does not resolve unused x402 peer dependencies during deployment.
  serverExternalPackages: ["@coinbase/cdp-sdk"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "xn7vvoayg4wfvz7s.public.blob.vercel-storage.com",
      },
      {
        protocol: "https",
        hostname: "pbs.twimg.com",
      },
    ],
  },
};

export default nextConfig;
