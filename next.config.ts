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
    // Only the standalone reveal document may be framed by Telegram. Its route
    // supplies the restrictive frame-ancestors policy; the website retains DENY.
    return [
      {source:"/:path*",headers:securityHeaders.filter(header=>header.key!=="X-Frame-Options")},
      {source:"/((?!api/key-export(?:/|$)).*)",headers:[{key:"X-Frame-Options",value:"DENY"}]},
    ];
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
