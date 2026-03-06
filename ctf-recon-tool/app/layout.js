import "./globals.css";

export const metadata = {
  title: "CTF Recon Timeline Assistant",
  description: "A hacker-themed tool to help capture, document, and execute recon commands.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
