import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The content dashboard reads Markdown/JSON from the repo-root `content/`
  // directory (one level above this app). Point Next's file tracer at the repo
  // root and explicitly include that tree so the files are bundled into the
  // serverless functions on Vercel — otherwise fs reads outside `admin/` are
  // dropped from the deployment. Harmless in local/container runs.
  experimental: {
    outputFileTracingRoot: path.join(__dirname, ".."),
    outputFileTracingIncludes: {
      "/content/**": ["../content/**/*"],
      "/api/content/**": ["../content/**/*"],
    },
  },
};

export default nextConfig;
