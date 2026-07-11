/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/engine/:path*.wasm",
        headers: [{ key: "Content-Type", value: "application/wasm" }],
      },
    ];
  },
};

export default nextConfig;
