// app/api/auth/resend-verification/route.ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { sendVerificationRequest } from "next-auth/providers/email";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    if (user.emailVerified) {
      return NextResponse.json(
        { error: "Email already verified" },
        { status: 400 }
      );
    }

    // Generate new verification token
    const token = crypto.randomUUID();
    
    await prisma.verificationToken.create({
      data: {
        identifier: email,
        token,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });

    // Send verification email
    await sendVerificationRequest({
      identifier: email,
      url: `${process.env.NEXTAUTH_URL}/auth/verify?token=${token}`,
      provider: {
        server: {
          host: process.env.EMAIL_SERVER_HOST,
          port: process.env.EMAIL_SERVER_PORT,
          auth: {
            user: process.env.EMAIL_SERVER_USER,
            pass: process.env.EMAIL_SERVER_PASSWORD,
          },
        },
        from: process.env.EMAIL_FROM,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to resend verification email" },
      { status: 500 }
    );
  }
}