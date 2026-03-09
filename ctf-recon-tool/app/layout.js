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

const rawVersion = process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0';
const rawGitSha = process.env.NEXT_PUBLIC_GIT_SHA || 'unknown';
const versionLabel = rawVersion.startsWith('v') ? rawVersion : `v${rawVersion}`;
const gitShaLabel = rawGitSha === 'unknown' ? 'unknown' : rawGitSha.slice(0, 7);

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={cinzelDecorative.variable}>
        {children}
        <footer className="version-footer mono" role="contentinfo">
          <strong>Helm&apos;s Watch</strong>
          <span aria-hidden="true">•</span>
          <span>{versionLabel} ({gitShaLabel})</span>
        </footer>
      </body>
    </html>
  );
}
