import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Sign Up | Uptime important.is",
  description: "Create your Uptime important.is account",
}

export default function SignUpLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}