import type { Metadata } from "next";
import { Phone, Mail, MapPin, Clock } from "lucide-react";
import { ContactForm } from "@/components/contact-form";
import { prisma } from "@/lib/prisma";
import { getBusinessDetails } from "@/lib/business-data";
import { EditableText } from "@/components/site-content/editable-text";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with Trims and Bubbles — hours, location, and contact details.",
};

const DAY_LABELS: Record<number, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

export default async function ContactPage() {
  const [rules, business] = await Promise.all([
    prisma.availabilityRule.findMany({ orderBy: { dayOfWeek: "asc" } }),
    getBusinessDetails(),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
      <EditableText contentKey="contact.intro.heading" as="h1" className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Contact
      </EditableText>
      <EditableText contentKey="contact.intro.text" as="p" className="mt-3 max-w-lg text-muted-foreground text-pretty">
        Questions about a service, or ready to lock in a time? Send a message, call, or just
        book straight away.
      </EditableText>

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-2">
        <div className="space-y-8">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Phone className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="font-medium">Phone</p>
                <p className="text-sm text-muted-foreground">{business.contactPhone}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="font-medium">Email</p>
                <p className="text-sm text-muted-foreground">{business.contactEmail}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="font-medium">Location</p>
                <p className="text-sm text-muted-foreground">{business.fullAddress}</p>
                <p className="text-sm text-muted-foreground">{business.serviceAreaNote}</p>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              <p className="font-medium">Hours</p>
            </div>
            <div className="overflow-hidden rounded-xl border border-border">
              {rules.map((rule) => (
                <div
                  key={rule.dayOfWeek}
                  className="flex items-center justify-between border-b border-border px-4 py-2.5 text-sm last:border-b-0"
                >
                  <span>{DAY_LABELS[rule.dayOfWeek]}</span>
                  <span className={rule.isActive ? "" : "text-muted-foreground"}>
                    {rule.isActive ? `${rule.startTime} – ${rule.endTime}` : "Closed"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border p-6">
          <EditableText contentKey="contact.form.heading" as="h2" className="mb-4 text-lg font-semibold">
            Send a message
          </EditableText>
          <ContactForm />
        </div>
      </div>
    </div>
  );
}
