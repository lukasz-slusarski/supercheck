import { Metadata } from "next/types";

export const metadata: Metadata = {
  title: "Quick Create | Uptime important.is",
  description: "Create a new resource",
};

export default function CreateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
