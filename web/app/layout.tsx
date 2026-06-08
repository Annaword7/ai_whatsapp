import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  title: 'AI WhatsApp Client',
  description: 'WhatsApp web client with AI translation and smart replies.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'AI WA' },
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
};

export const viewport: Viewport = {
  themeColor: '#1f9d55',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-[100dvh] antialiased" suppressHydrationWarning>
        <Providers>
          {/* suppressHydrationWarning: some browser extensions inject attributes
              into this wrapper before hydration, causing a harmless mismatch. */}
          <div
            className="mx-auto flex h-[100dvh] max-w-md flex-col overflow-hidden bg-background shadow-xl sm:my-0"
            suppressHydrationWarning
          >
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
