import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    // Redirect non-onboarded users to onboarding
    if (token && !token.onboarded && !path.startsWith("/onboarding")) {
      return NextResponse.redirect(new URL("/onboarding", req.url));
    }

    // Redirect onboarded users away from onboarding
    if (token?.onboarded && path.startsWith("/onboarding")) {
      return NextResponse.redirect(new URL("/chat", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: ["/chat/:path*", "/onboarding/:path*"],
};