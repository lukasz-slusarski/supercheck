import { Metadata } from "next/types";

export const metadata: Metadata = {
    title: "Requirements | Uptime important.is",
    description: "Manage product requirements and link them to tests",
};

export default function RequirementsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
