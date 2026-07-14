import type { Metadata } from "next";
import { MessageSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Messages" };

export default async function PortalMessagesPage() {
  const session = await getCurrentSession();
  const client = await prisma.client.findUnique({ where: { userId: session!.user.id } });

  const messages = client
    ? await prisma.clientMessage.findMany({
        where: { clientId: client.id },
        orderBy: { createdAt: "desc" },
      })
    : [];

  // Mark this client's unread messages as read now that they're viewing them.
  // Scoped strictly to their own rows, resolved from the session.
  if (client) {
    await prisma.clientMessage.updateMany({
      where: { clientId: client.id, readAt: null },
      data: { readAt: new Date() },
    });
  }

  const dateTimeFmt = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Messages</h1>
      <p className="mt-1 text-muted-foreground">Notes and updates from Trims &amp; Bubbles.</p>

      {messages.length === 0 ? (
        <Card className="mt-8">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <MessageSquare className="h-8 w-8" />
            <p>No messages yet. We&apos;ll let you know if there&apos;s anything to share.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-8 space-y-4">
          {messages.map((msg) => (
            <Card key={msg.id}>
              <CardContent className="py-4">
                {msg.subject && <p className="font-medium">{msg.subject}</p>}
                <p className="text-xs text-muted-foreground">{dateTimeFmt.format(msg.createdAt)}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm">{msg.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
