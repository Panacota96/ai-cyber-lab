import "./globals.css";
import { Cinzel_Decorative } from 'next/font/google';

const cinzelDecorative = Cinzel_Decorative({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
  variable: '--font-cinzel-decorative',
  display: 'swap',
});

export const metadata = {
  title: "Helm's Watch - CTF Recon Assistant",
  description: 'Premium timeline and documentation tool for CTF reconnaissance.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={cinzelDecorative.variable}>
        {children}
      </body>
    </html>
  );
}
