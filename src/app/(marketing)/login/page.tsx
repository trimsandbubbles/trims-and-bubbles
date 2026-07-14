import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Log In" };

export default function LoginPage() {
  return (
    <AuthCard title="Welcome back" description="Sign in to see your dogs, bookings, and grooming history.">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
