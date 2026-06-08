/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Produces a self-contained server build (handy for Docker / Railway).
  output: 'standalone',
};

export default nextConfig;
