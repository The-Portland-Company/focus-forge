import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from web-app first, then fall back to repo root after the repo split.
dotenv.config({ path: path.join(__dirname, ".env.local"), override: false });
dotenv.config({ path: path.join(__dirname, ".env"), override: false });
dotenv.config({ path: path.join(__dirname, "..", ".env"), override: false });

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
