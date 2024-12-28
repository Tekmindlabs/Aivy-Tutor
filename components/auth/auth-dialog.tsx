"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";

type AuthDialogProps = {
  children: React.ReactNode;
  mode: "signin" | "signup";
};

export function AuthDialog({ children, mode }: AuthDialogProps) {
  const [open, setOpen] = useState(false);

  const handleSocialSignIn = (provider: string) => {
    signIn(provider, {
      callbackUrl: mode === "signup" ? "/onboarding" : "/dashboard",
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <div className="flex flex-col space-y-6 py-6">
          <div className="flex flex-col space-y-2 text-center">
            <h3 className="text-2xl font-semibold">
              {mode === "signin" ? "Welcome back" : "Get started"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {mode === "signin" 
                ? "Sign in to your account to continue" 
                : "Create an account to start learning"
              }
            </p>
          </div>

          <div className="flex flex-col space-y-4">
            <Button
              variant="outline"
              onClick={() => handleSocialSignIn("google")}
            >
              <Icons.google className="mr-2 h-4 w-4" />
              Continue with Google
            </Button>
            
            <Button
              variant="outline"
              onClick={() => handleSocialSignIn("facebook")}
            >
              <Icons.facebook className="mr-2 h-4 w-4" />
              Continue with Facebook
            </Button>

            {/* Add email sign in form here if needed */}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}