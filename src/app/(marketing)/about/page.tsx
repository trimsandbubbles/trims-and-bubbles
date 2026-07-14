import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CalendarCheck, Car, ShieldCheck, Heart, GraduationCap, Award, BadgeCheck, ArrowRight } from "lucide-react";
import { businessConfig } from "@/config/business";
import { displayOrFallback } from "@/lib/placeholder";
import { getBusinessDetails } from "@/lib/business-data";
import { EditableText } from "@/components/site-content/editable-text";
import { EditableImage } from "@/components/site-content/editable-image";

export const metadata: Metadata = {
  title: "About",
  description: "Meet Trims and Bubbles — our credentials, and what to expect from your dog's grooming visit.",
};

const { credentials } = businessConfig;
const experience = displayOrFallback(credentials.yearsExperience, "Years of hands-on experience");

const SALON_STEPS = [
  {
    key: "dropoff",
    icon: CalendarCheck,
    title: "Drop-off",
    body: "Arrive at your scheduled time — we keep a relaxed pace between bookings so there's no rushed handover. A quick chat about anything we should know, and your dog settles in.",
  },
  {
    key: "during-groom",
    icon: Heart,
    title: "During the groom",
    body: "Your dog stays only as long as their service takes — no boarding or day care. We work at your dog's pace, with breaks if needed, so it never feels like an assembly line.",
  },
  {
    key: "calm-environment",
    icon: ShieldCheck,
    title: "A calm environment",
    body: "Dogs settle best without their owner in the room — it keeps them focused rather than trying to get back to you. Happy to show you around before or after your appointment.",
  },
  {
    key: "pickup",
    icon: Car,
    title: "Pickup — or we bring them home",
    body: "Collect your dog looking (and smelling) their best, with a quick note on how the groom went. Can't make it in? Add Pickup and Drop-off at checkout.",
  },
];

export default async function AboutPage() {
  const business = await getBusinessDetails();
  const qualification = credentials.hasCertificate
    ? business.credentialTitle
    : "Trained on the job with an experienced mentor groomer";
  const institution = credentials.hasCertificate ? business.credentialInstitution || null : null;

  return (
    <div>
      {/* ---------------- Logo feature ---------------- */}
      <div className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-12 text-center sm:px-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Trims & Bubbles" className="mx-auto h-52 w-auto sm:h-60" />
        </div>
      </div>

      {/* ---------------- Founder story ---------------- */}
      <section className="border-b border-border">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
          <div>
            <div className="relative aspect-square w-32 overflow-hidden rounded-2xl border border-border sm:w-36">
              <EditableImage
                contentKey="about.portrait"
                alt="Portrait of the groomer"
                fill
                className="object-cover"
                sizes="144px"
              />
            </div>
            <EditableText contentKey="about.story.kicker" as="p" className="kicker mt-6">Our story</EditableText>
            <EditableText
              contentKey="about.story.heading"
              as="h1"
              className="mt-6 text-4xl font-black leading-[1.05] text-balance sm:text-5xl"
            >
              Ten years of dogs in our home — now in the tub.
            </EditableText>
            <div className="mt-6 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <EditableText contentKey="about.story.p1" as="p" className="text-pretty">
                {`Trims & Bubbles grew out of ${businessConfig.credentials.yearsExperience} of in-home dog boarding, right here in ${businessConfig.location.suburb}. Over those years we've looked after every kind of dog — nervous rescues, bouncy puppies, senior dogs who just want a quiet corner — and learned how to make each one feel at home.`}
              </EditableText>
              <EditableText contentKey="about.story.p2" as="p" className="text-pretty">
                Now we&apos;re bringing that same patient, unhurried care to washing, grooming and
                trimming. Same calm hands, same love of dogs — with a professional groom at the
                end of it.
              </EditableText>
            </div>
          </div>
          <div className="relative mx-auto aspect-4/5 w-full max-w-md overflow-hidden rounded-sm lg:max-w-none">
            <EditableImage
              contentKey="about.story.image"
              fallbackSrc="/seed-images/gallery-poodle-standard.jpg"
              alt="A calm, freshly groomed dog at Trims and Bubbles"
              fill
              priority
              className="object-cover"
              sizes="(min-width: 1024px) 44vw, 90vw"
            />
          </div>
        </div>
      </section>

      {/* ---------------- Credentials — MAJOR ---------------- */}
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
          <div className="flex items-center gap-3">
            <span className="h-px w-8 bg-accent-solid" />
            <EditableText contentKey="about.credentials.kicker" as="span" className="text-xs font-bold uppercase tracking-[0.22em] text-accent-solid">Credentials</EditableText>
          </div>
          <EditableText
            contentKey="about.credentials.heading"
            as="h2"
            className="mt-6 max-w-2xl text-3xl font-bold text-balance sm:text-4xl"
          >
            Real training and real experience behind every single groom.
          </EditableText>

          <div className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-2">
            <div className="border-t border-primary-foreground/20 pt-6">
              <GraduationCap className="h-8 w-8 text-accent-solid" />
              <h3 className="mt-4 text-xl font-extrabold">{qualification}</h3>
              <EditableText contentKey="about.credentials.qualification.explainer" as="p" className="mt-2 text-lg font-semibold">
                {`A recognised dog grooming qualification${institution ? ` — ${institution}` : ""}.`}
              </EditableText>
              <EditableText
                contentKey="about.credentials.qualification.text"
                as="p"
                className="mt-2 text-sm text-primary-foreground/60"
              >
                The coat, skin and safety knowledge behind every wash, trim and style — so your dog
                is in properly trained hands.
              </EditableText>
            </div>
            <div className="border-t border-primary-foreground/20 pt-6">
              <Award className="h-8 w-8 text-accent-solid" />
              <h3 className="mt-4 text-xl font-extrabold">{experience} with dogs</h3>
              <EditableText
                contentKey="about.credentials.experience.subheading"
                as="p"
                className="mt-2 text-lg font-semibold"
              >
                A decade-plus of in-home dog boarding.
              </EditableText>
              <EditableText
                contentKey="about.credentials.experience.text"
                as="p"
                className="mt-2 text-sm text-primary-foreground/60"
              >
                Years spent reading temperaments and keeping anxious dogs calm and comfortable —
                exactly what makes grooming day stress-free.
              </EditableText>
            </div>
          </div>

          <div className="mt-12 flex items-center gap-3 border-t border-primary-foreground/20 pt-6 text-sm text-primary-foreground/70">
            <BadgeCheck className="h-5 w-5 shrink-0 text-accent-solid" />
            <EditableText contentKey="about.credentials.insurance" as="p">
              Fully insured, and every groom finished with a coat-and-skin health check at no extra charge.
            </EditableText>
          </div>
        </div>
      </section>

      {/* ---------------- A day at the salon ---------------- */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <div className="border-b border-border pb-6">
          <EditableText contentKey="about.salon.kicker" as="p" className="kicker">
            A day at the salon
          </EditableText>
          <EditableText contentKey="about.salon.heading" as="h2" className="mt-4 text-3xl font-bold sm:text-4xl">
            What to expect
          </EditableText>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2">
          {SALON_STEPS.map((step) => (
            <div key={step.title} className="bg-card p-7">
              <step.icon className="h-6 w-6 text-accent-solid" />
              <EditableText contentKey={`about.salon.${step.key}.title`} as="h3" className="mt-4 text-lg font-bold">
                {step.title}
              </EditableText>
              <EditableText
                contentKey={`about.salon.${step.key}.body`}
                as="p"
                className="mt-2 text-sm leading-relaxed text-muted-foreground"
              >
                {step.body}
              </EditableText>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <EditableText contentKey="about.cta.text" as="p" className="text-lg font-semibold">
            Ready to give your dog the calm groom they deserve?
          </EditableText>
          <Button size="lg" render={<Link href="/book" />}>
            Book an appointment <ArrowRight />
          </Button>
        </div>
      </section>
    </div>
  );
}
