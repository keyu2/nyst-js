/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: [
    "10.77.77.*",
    "192.168.4.*",
    "192.168.50.*",
    "*.trycloudflare.com",
  ],
};

export default nextConfig;
