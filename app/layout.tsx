import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ProtoLab MCP Server',
  description:
    'Remote MCP server for the Ink Design System — 63 components, 8 tools, 3 prompts. One URL, no installs.',
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
