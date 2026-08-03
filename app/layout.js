import './globals.css';

export const metadata = {
  title: 'Family Phases — every week, in phase',
  description: 'Co-parenting schedules, expenses, and reminders in one place.',
};

export const viewport = {
  themeColor: '#171A23',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;600;700&display=swap" rel="stylesheet" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
