import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ProtoLab — Prototype any Docusign page with AI',
  description:
    'Describe what you want to build. Your AI knows the entire Ink Design System and builds working prototypes that look like the real product.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
