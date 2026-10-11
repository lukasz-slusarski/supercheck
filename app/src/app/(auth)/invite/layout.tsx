import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Invitation | Uptime important.is",
  description: "Accept your organization invitation",
};

export default function InviteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
