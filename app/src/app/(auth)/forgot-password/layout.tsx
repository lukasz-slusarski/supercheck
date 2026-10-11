import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Forgot Password | Uptime important.is",
  description: "Reset your Uptime important.is account password",
};

export default function ForgotPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
