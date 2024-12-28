import { NextAuthOptions } from "next-auth";

import GoogleProvider from "next-auth/providers/google";

import EmailProvider from "next-auth/providers/email";

import { PrismaAdapter } from "@auth/prisma-adapter";

import { prisma } from "@/lib/prisma";

import { Resend } from 'resend';


const resend = new Resend(process.env.RESEND_API_KEY);


export const authConfig: NextAuthOptions = {

  adapter: PrismaAdapter(prisma),

  providers: [

    GoogleProvider({

      clientId: process.env.GOOGLE_CLIENT_ID!,

      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,

    }),

    EmailProvider({

      server: {

        host: process.env.EMAIL_SERVER_HOST,

        port: process.env.EMAIL_SERVER_PORT,

        auth: {

          user: process.env.EMAIL_SERVER_USER,

          pass: process.env.EMAIL_SERVER_PASSWORD,

        },

      },

      from: process.env.EMAIL_FROM,

      async sendVerificationRequest({

        identifier: email,

        url,

        provider: { from },

      }) {

        try {

          const result = await resend.emails.send({

            from: from,

            to: email,

            subject: "Sign in to Aivy Tutor",

            html: `

              <div>

                <h1>Sign in to Aivy Tutor</h1>

                <p>Click the link below to sign in to your account:</p>

                <a href="${url}">Sign in</a>

                <p>If you didn't request this email, you can safely ignore it.</p>

              </div>

            `,

          });


          if (result.error) {

            throw new Error(result.error.message);

          }

        } catch (error) {

          console.error("Error sending verification email", error);

          throw new Error("Failed to send verification email");

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