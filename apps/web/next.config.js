/** @type {import('next').NextConfig} */
// Same-origin API: the browser calls "/api/*" (see NEXT_PUBLIC_API_URL=/api),
// which avoids CORS and works under any hostname. In front of the domain,
// nginx maps /api/ straight to the API. For direct LAN access to the web port
// (no nginx in the path), this rewrite proxies /api/* to the API container so
// the same relative URL keeps working.
const API_PROXY_TARGET = process.env.API_PROXY_TARGET || "http://api:5000";

const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_PROXY_TARGET}/:path*` }];
  },
};
module.exports = nextConfig;
