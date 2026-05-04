import type { NextConfig } from "next";
import { buildHydraPublicRewrites } from "./src/lib/auth/hydra-public-rewrites";

const nextConfig: NextConfig = {
  async rewrites() {
    return buildHydraPublicRewrites(process.env.HYDRA_PUBLIC_URL);
  },
};

export default nextConfig;
