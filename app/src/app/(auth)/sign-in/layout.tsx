import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Sign In | Uptime important.is",
  description: "Sign in to your Uptime important.is account",
}

export default function SignInLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}