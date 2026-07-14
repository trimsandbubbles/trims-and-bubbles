"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { signIn, signUp } from "@/lib/auth-client";
import { ensureClientProfile } from "@/lib/actions/client-profile";

export function InlineAuth({ onAuthenticated }: { onAuthenticated: (name: string, phone?: string) => void }) {
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const { data, error: signInError } = await signIn.email({ email, password });
    setPending(false);
    if (signInError || !data) {
      setError(signInError?.message ?? "Couldn't sign you in — check your email and password.");
      return;
    }
    onAuthenticated(data.user.name);
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password needs to be at least 8 characters.");
      return;
    }
    setPending(true);
    const { data, error: signUpError } = await signUp.email({ email, password, name });
    if (signUpError || !data) {
      setPending(false);
      setError(signUpError?.message ?? "Couldn't create your account — please try again.");
      return;
    }
    await ensureClientProfile(phone || undefined);
    setPending(false);
    onAuthenticated(data.user.name, phone || undefined);
  }

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        Booking creates your Trims and Bubbles account, so you can see photos, history and upcoming appointments any time.
      </p>
      <Tabs value={tab} onValueChange={(v) => setTab(v as "signin" | "signup")}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="signin">I&apos;ve booked before</TabsTrigger>
          <TabsTrigger value="signup">First time here</TabsTrigger>
        </TabsList>

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <TabsContent value="signin" className="mt-4">
          <form onSubmit={handleSignIn} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="signin-email">Email</Label>
              <Input id="signin-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="signin-password">Password</Label>
              <Input
                id="signin-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Signing in..." : "Sign in & continue"}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="signup" className="mt-4">
          <form onSubmit={handleSignUp} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="signup-name">Your name</Label>
              <Input id="signup-name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="signup-email">Email</Label>
              <Input id="signup-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="signup-phone">Phone</Label>
              <Input id="signup-phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="signup-password">Password</Label>
              <Input
                id="signup-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
            </div>
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Creating account..." : "Create account & continue"}
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}
