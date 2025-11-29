import './globals.css';
import { Providers } from '@/components/Providers';
import Header from '@/components/Header';

export const metadata = {
  title: 'User Management System',
  description: 'Enterprise user management application',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        <Providers>
          <Header />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
