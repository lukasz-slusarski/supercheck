import { Metadata } from "next/types";

// Generate metadata with the test ID
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: `Playground | Uptime important.is`,
    description: `Edit and run test script`,
  };
}

export default function PlaygroundIdLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
