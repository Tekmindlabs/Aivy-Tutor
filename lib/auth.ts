import { PrismaAdapter } from "@auth/prisma-adapter";
import { NextAuthOptions } from "next-auth";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  callbacks: {
    async session({ session, user }) {
      if (session?.user) {
        session.user.id = user.id;
        session.user.onboarded = user.onboarded;
        session.user.role = user.role;
      }
      return session;
    },
    async signIn({ user }) {
      // Update last login time
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() }
      });
      return true;
    }
  },
  pages: {
    signIn: '/auth/signin',
    verifyRequest: '/auth/verify',
    error: '/auth/error'
  }
};