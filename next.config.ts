import withMDXFactory from "@next/mdx";
import type { NextConfig } from "next";

const withMDX = withMDXFactory({
  extension: /\.mdx?$/,
});

const nextConfig: NextConfig = {
  pageExtensions: ["ts", "tsx", "md", "mdx"],
  reactStrictMode: true,
  // Cache Components / PPR habilitados quando estáveis em Next 16+.
  // experimental: { ppr: true },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }],
  },
};

export default withMDX(nextConfig);
