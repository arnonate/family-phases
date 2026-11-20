/** @type {import('next').NextConfig} */
const nextConfig = {
  // Browsers must always fetch the latest service worker
  async headers() {
    return [{ source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }] }];
  },
};
export default nextConfig;
