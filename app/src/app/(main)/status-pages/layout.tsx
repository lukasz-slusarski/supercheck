import { Metadata } from "next/types";

export const metadata: Metadata = {
  title: "Status Pages | Uptime important.is",
  description: "View and edit status pages",
};

export default function StatusPagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
