import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import EmailProvider from "next-auth/providers/email";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { User } from "@prisma/client";
import { JWT } from "next-auth/jwt";
import { Resend } from 'resend';

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// Define types for session and callbacks
interface SessionUser {
  id: string;
  name: string | null;
  email: string | null;
  emailVerified: Date | null;
  image: string | null;
}

interface AuthorizedParams {
  auth: {
    user?: SessionUser;
  } | null;
  request: {
    nextUrl: URL;
  };
}

export const authConfig: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    EmailProvider({
      from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
      sendVerificationRequest: async ({ identifier, url, provider }) => {
        try {
          const { data, error } = await resend.emails.send({
            from: provider.from!,
            to: identifier,
            subject: 'Sign in to Aivy Tutor',
            html: `
              <!DOCTYPE html>
              <html>
                <head>
                  <meta charset="utf-8">
                  <title>Sign in to Aivy Tutor</title>
                </head>
                <body style="font-family: sans-serif; padding: 20px;">
                  <h1 style="color: #333;">Sign in to Aivy Tutor</h1>
                  <p>Click the link below to sign in to your account:</p>
                  <a 
                    href="${url}" 
                    style="
                      background-color: #4CAF50;
                      color: white;
                      padding: 14px 20px;
                      text-decoration: none;
                      border-radius: 4px;
                      display: inline-block;
                      margin: 10px 0;
                    "
                  >
                    Sign in
                  </a>
                  <p style="color: #666; font-size: 14px;">
                    If you didn't request this email, you can safely ignore it.
                  </p>
                </body>
              </html>
            `,
          });

          if (error) {
            console.error('Error sending email:', error);
            throw new Error(error.message);
          }
        } catch (error) {
          console.error('Failed to send verification email:', error);
          throw new Error('Failed to send verification email');
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        (session.user as SessionUser).id = token.id as string;
      }
      return session;
    },
    async signIn({ user }) {
      if (user) {
        return true;
      }
      return false;
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");
      
      if (isOnDashboard) {
        if (isLoggedIn) return true;
        return false;
      } else if (isLoggedIn) {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }
      return true;
    },
  },
  events: {
    async signIn({ user }) {
      // Handle sign in event
      console.log('User signed in:', user);
    },
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
};