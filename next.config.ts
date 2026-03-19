import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist doit être résolu par Node nativement — pas bundlé par webpack.
  serverExternalPackages: ["pdfjs-dist", "canvas"],

  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      // Empêche webpack de planter sur le peer dep optionnel de pdfjs
      canvas: false,
    };
    return config;
  },
};

export default nextConfig;
