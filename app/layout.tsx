import Header from '@/components/Header';
import './globals.css';

import localFont from 'next/font/local';
import classNames from 'classnames';

const bb = localFont({
  src: [
    {
      path: '../public/assets/fonts/BB-Regular.woff2',
    },
  ],
  variable: '--font-bb',
});

const lUlys = localFont({
  src: [
    {
      path: '../public/assets/fonts/lyno/lyno-ulys_2-webfont.woff2',
    },
  ],
  variable: '--font-lulys',
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='en'>
      <body className={classNames(lUlys.variable, bb.variable)}>
        <Header />

        {children}
      </body>
    </html>
  );
}
