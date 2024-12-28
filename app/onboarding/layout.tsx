import { getSession } from "@/lib/auth";  // or "@/auth/auth" depending on your project structure
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  
  if (!session) {
    redirect("/api/auth/signin");
  }

  // Check if user is already onboarded
  const user = await prisma.user.findUnique({
    where: { id: session.user?.id },
    select: { onboarded: true },
  });

  if (user?.onboarded) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-100 dark:from-gray-900 dark:to-black">
      <main className="container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}