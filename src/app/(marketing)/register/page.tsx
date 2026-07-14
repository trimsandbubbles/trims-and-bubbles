import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = { title: "Create an Account" };

export default function RegisterPage() {
  return (
    <AuthCard title="Create your account" description="Book appointments and keep track of your dog's grooming history.">
      <Suspense>
        <RegisterForm />
      </Suspense>
    </AuthCard>
  );
}
