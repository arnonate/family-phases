import './globals.css';

export const metadata = {
  title: 'Family Phases',
  description: 'Every family has its phases. Co-parenting schedules, expenses, and reminders in one place.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
