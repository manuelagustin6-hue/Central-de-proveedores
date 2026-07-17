/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Vercel limita el cuerpo de la petición a ~4.5 MB
      bodySizeLimit: '4500kb',
    },
  },
};

module.exports = nextConfig;
