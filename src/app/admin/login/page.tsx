import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { AdminLoginForm } from "@/components/auth/admin-login-form";

export const metadata: Metadata = { title: "Staff Login" };

export default function AdminLoginPage() {
  return (
    <AuthCard title="Staff login" description="For Trims and Bubbles owner & groomer access.">
      <Suspense>
        <AdminLoginForm />
      </Suspense>
    </AuthCard>
  );
}
