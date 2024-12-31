import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  // Check if user is already onboarded
  if (session.user.onboarded) {
    redirect("/chat");
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-100 dark:from-gray-900 dark:to-black">
      <main className="container mx-auto p-6">{children}</main>
    </div>
  );
}