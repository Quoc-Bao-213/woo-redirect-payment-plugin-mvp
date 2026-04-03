import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

const localDevOrigins = ["http://localhost:*", "http://127.0.0.1:*", "ws://localhost:*", "ws://127.0.0.1:*"];

const connectSrc = [
  "'self'",
  "https://sandbox-api.auxvault.net",
  "https://dev-api.auxvault.net",
  "https://vault.auxvault.net",
  "https://luqratoken.com",
  ...(isDev ? localDevOrigins : []),
].join(" ");

const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  ...(isDev ? ["'unsafe-eval'"] : []),
  "https://luqratoken.com",
].join(" ");

const frameSrc = [
  "'self'",
  "https://luqratoken.com",
  "https://sandbox-api.auxvault.net",
  "https://dev-api.auxvault.net",
  "https://vault.auxvault.net",
  ...(isDev ? ["http://localhost:*", "http://127.0.0.1:*"] : []),
].join(" ");

const csp = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `frame-src ${frameSrc}`,
  `connect-src ${connectSrc}`,
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: csp,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
