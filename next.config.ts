import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  turbopack: {
    // Pin the Turbopack root to this project directory.
    // Without this, Turbopack walks up and finds C:\Users\Thien\package-lock.json,
    // treating that as the workspace root instead.
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
