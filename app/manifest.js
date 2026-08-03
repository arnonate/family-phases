export default function manifest() {
  return {
    name: 'Family Phases',
    short_name: 'Phases',
    description: 'Co-parenting schedules, expenses, and reminders in one place.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#F9F9F1',
    theme_color: '#171A23',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
