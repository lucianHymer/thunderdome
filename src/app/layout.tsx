import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { SignInButton } from "@/components/auth/sign-in-button";
import { UserMenu } from "@/components/auth/user-menu";
import { getCurrentUser } from "@/lib/session";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Thunderdome - AI Gladiator Arena",
  description: "Pit AI gladiators against your coding problems",
  icons: {
    icon: "/favicon.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <div className="min-h-screen bg-background text-foreground">
          <header className="border-b border-border">
            <div className="container mx-auto px-4 py-4">
              <div className="flex items-center justify-between">
                <Link href="/">
                  <h1 className="text-2xl font-bold cursor-pointer hover:text-orange-400 transition-colors">
                    ⚔️ Thunderdome
                  </h1>
                </Link>
                <nav className="flex items-center gap-4">
                  {user ? (
                    <>
                      <Link
                        href="/trials/new"
                        className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors"
                      >
                        New Trial
                      </Link>
                      <Link
                        href="/settings"
                        className="px-4 py-2 hover:text-orange-400 transition-colors"
                      >
                        Settings
                      </Link>
                      <UserMenu />
                    </>
                  ) : (
                    <SignInButton />
                  )}
                </nav>
              </div>
            </div>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
