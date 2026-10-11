import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Alerts | Uptime important.is",
  description: "Monitor alert history and manage notification channels",
};

export default function AlertsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
} 