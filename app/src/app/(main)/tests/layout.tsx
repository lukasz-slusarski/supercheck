import { Metadata } from "next/types";

export const metadata: Metadata = {
  title: "Tests | Uptime important.is",
  description: "View and manage all tests",
};

export default function TestsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
