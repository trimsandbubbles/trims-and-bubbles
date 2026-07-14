/**
 * Dev/demo seed data. Safe to re-run — clears domain + auth tables first.
 * Run with: npm run db:seed
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin as adminPlugin } from "better-auth/plugins";
import { ac, owner, staff, client as clientRole } from "../src/lib/permissions";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// A standalone Better Auth instance for seeding (same config shape as src/lib/auth.ts)
// so passwords are hashed exactly the way the real app expects.
const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true, requireEmailVerification: false },
  plugins: [
    adminPlugin({ ac, defaultRole: "client", adminRoles: ["owner", "staff"], roles: { owner, staff, client: clientRole } }),
  ],
});

const DAY_MS = 24 * 60 * 60 * 1000;

/** Returns a Date at `daysOffset` from today (negative = past) at the given HH:mm (local server time). */
function atOffset(daysOffset: number, hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  d.setHours(h, m, 0, 0);
  return d;
}

async function createUser(email: string, name: string, password: string, role: "owner" | "staff" | "client") {
  const { user } = await auth.api.signUpEmail({ body: { name, email, password } });
  await prisma.user.update({ where: { id: user.id }, data: { role } });
  return prisma.user.findUniqueOrThrow({ where: { id: user.id } });
}

async function main() {
  console.log("Clearing existing data...");
  await prisma.appointmentPhoto.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.appointmentAddOn.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.pet.deleteMany();
  await prisma.client.deleteMany();
  await prisma.servicePrice.deleteMany();
  await prisma.service.deleteMany();
  await prisma.availabilityRule.deleteMany();
  await prisma.availabilityException.deleteMany();
  await prisma.blockedTimeSlot.deleteMany();
  await prisma.businessSettings.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verification.deleteMany();
  await prisma.user.deleteMany();

  console.log("Business settings...");
  await prisma.businessSettings.create({
    data: {
      id: 1,
      depositPercentage: 20,
      businessName: "Trims and Bubbles",
      contactEmail: "hello@trimsandbubbles.example",
      contactPhone: null,
      bufferMinutes: 15,
    },
  });

  console.log("Availability (Sun & Sat full day, Mon/Thu/Fri evenings, Tue/Wed closed)...");
  // Evening close of 20:00 is an assumption (the owner only specified "from 4pm" for
  // Mon/Thu/Fri) — adjust the finish time for those days in admin if needed.
  const dayConfigs = [
    { dayOfWeek: 0, isActive: true, startTime: "09:00", endTime: "17:00" }, // Sun - full day
    { dayOfWeek: 1, isActive: true, startTime: "16:00", endTime: "20:00" }, // Mon - evenings from 4pm
    { dayOfWeek: 2, isActive: false, startTime: "09:00", endTime: "17:00" }, // Tue - closed
    { dayOfWeek: 3, isActive: false, startTime: "09:00", endTime: "17:00" }, // Wed - closed
    { dayOfWeek: 4, isActive: true, startTime: "16:00", endTime: "20:00" }, // Thu - evenings from 4pm
    { dayOfWeek: 5, isActive: true, startTime: "16:00", endTime: "20:00" }, // Fri - evenings from 4pm
    { dayOfWeek: 6, isActive: true, startTime: "09:00", endTime: "17:00" }, // Sat - full day
  ];
  for (const d of dayConfigs) {
    await prisma.availabilityRule.create({
      data: { dayOfWeek: d.dayOfWeek, startTime: d.startTime, endTime: d.endTime, isActive: d.isActive },
    });
  }

  console.log("Services & pricing...");
  type PriceRow = { sizeBand: "SMALL" | "MEDIUM" | "LARGE" | "XL" | null; priceCents: number; isOnInspection?: boolean };
  const serviceDefs: {
    slug: string;
    name: string;
    description: string;
    category: "CORE" | "ADD_ON";
    durationMinutes: number;
    displayOrder: number;
    prices: PriceRow[];
  }[] = [
    {
      slug: "full-groom",
      name: "Full Groom",
      description:
        "The full works: bath with a coat-appropriate shampoo, blow-dry, full body clip or scissor-finish to breed standard or your preferred style, nail trim, and ear clean. Best for curly, non-shedding coats — poodles, cavoodles, schnauzers, and other oodle-type crosses — that need regular clipping to stay mat-free.",
      category: "CORE",
      durationMinutes: 180,
      displayOrder: 1,
      prices: [
        { sizeBand: "SMALL", priceCents: 9500 },
        { sizeBand: "MEDIUM", priceCents: 11500 },
        { sizeBand: "LARGE", priceCents: 13500 },
      ],
    },
    {
      slug: "wash-and-dry",
      name: "Wash and Dry",
      description:
        "A thorough bath with conditioning treatment and a full hand blow-dry and brush-out — no clipping. A great in-between-groom refresh, or a standalone option for coats that don't need trimming.",
      category: "CORE",
      durationMinutes: 60,
      displayOrder: 2,
      prices: [
        { sizeBand: "SMALL", priceCents: 5500 },
        { sizeBand: "MEDIUM", priceCents: 7000 },
        { sizeBand: "LARGE", priceCents: 8500 },
      ],
    },
    {
      slug: "wash-and-tidy",
      name: "Wash and Tidy",
      description:
        "Bath and blow-dry plus a light tidy-up — face, feet, sanitary areas, and a light overall trim — without a full restyle. A good middle-ground for coats that just need the edges neatened.",
      category: "CORE",
      durationMinutes: 90,
      displayOrder: 3,
      prices: [
        { sizeBand: "SMALL", priceCents: 7000 },
        { sizeBand: "MEDIUM", priceCents: 8500 },
        { sizeBand: "LARGE", priceCents: 10500 },
      ],
    },
    {
      slug: "groom-out",
      name: "Groom Out",
      description:
        "Undercoat removal plus a light hygiene-area trim for longer, double-coated breeds — border collies, shepherds, retrievers, and husky-type dogs — that need de-bulking rather than a short clip.",
      category: "CORE",
      durationMinutes: 120,
      displayOrder: 4,
      prices: [
        { sizeBand: "SMALL", priceCents: 9000 },
        { sizeBand: "MEDIUM", priceCents: 10500 },
        { sizeBand: "LARGE", priceCents: 12500 },
      ],
    },
    {
      slug: "deshed",
      name: "Deshed",
      description:
        "A dedicated undercoat blow-out treatment to clear loose, dead hair at the root. Best for smooth or short double-coated shedders — kelpies, cattle dogs, labradors, and staffy-type breeds.",
      category: "CORE",
      durationMinutes: 120,
      displayOrder: 5,
      prices: [
        { sizeBand: "SMALL", priceCents: 6500 },
        { sizeBand: "MEDIUM", priceCents: 8000 },
        { sizeBand: "LARGE", priceCents: 10000 },
      ],
    },
    {
      slug: "nail-clipping-ear-cleaning",
      name: "Nail Clipping and Ear Cleaning",
      description: "A quick, no-bath top-up: nail trim and a gentle ear clean. Walk-ins welcome, any size.",
      category: "CORE",
      durationMinutes: 20,
      displayOrder: 6,
      prices: [{ sizeBand: null, priceCents: 2500 }],
    },
  ];

  const serviceIdBySlug = new Map<string, string>();
  for (const s of serviceDefs) {
    const created = await prisma.service.create({
      data: {
        slug: s.slug,
        name: s.name,
        description: s.description,
        category: s.category,
        durationMinutes: s.durationMinutes,
        displayOrder: s.displayOrder,
        prices: {
          create: s.prices.map((p) => ({
            sizeBand: p.sizeBand,
            priceCents: p.priceCents,
            isOnInspection: p.isOnInspection ?? false,
          })),
        },
      },
    });
    serviceIdBySlug.set(s.slug, created.id);
  }

  console.log("Owner & staff accounts...");
  await createUser("owner@trimsandbubbles.example", "Jess (Owner)", "OwnerPass123!", "owner");
  await createUser("staff@trimsandbubbles.example", "Sam (Groomer)", "StaffPass123!", "staff");

  console.log("Demo clients & pets...");
  const clientDefs: {
    email: string;
    name: string;
    phone: string;
    pets: { name: string; breed: string; sizeBand: "SMALL" | "MEDIUM" | "LARGE" | "XL"; coatType: string; photoUrl: string }[];
  }[] = [
    {
      email: "sarah.thompson@example.com",
      name: "Sarah Thompson",
      phone: "0412 345 001",
      pets: [{ name: "Bella", breed: "Cavoodle", sizeBand: "SMALL", coatType: "Curly, non-shedding", photoUrl: "/seed-images/bella-cavoodle.jpg" }],
    },
    {
      email: "james.chen@example.com",
      name: "James Chen",
      phone: "0412 345 002",
      pets: [{ name: "Max", breed: "Labrador Retriever", sizeBand: "LARGE", coatType: "Short, double coat", photoUrl: "/seed-images/max-labrador.jpg" }],
    },
    {
      email: "priya.nair@example.com",
      name: "Priya Nair",
      phone: "0412 345 003",
      pets: [
        { name: "Charlie", breed: "Border Collie", sizeBand: "MEDIUM", coatType: "Medium, double coat", photoUrl: "/seed-images/charlie-collie.jpg" },
        { name: "Ruby", breed: "Shih Tzu", sizeBand: "SMALL", coatType: "Long, flowing", photoUrl: "/seed-images/ruby-shihtzu.jpg" },
      ],
    },
    {
      email: "emma.wilson@example.com",
      name: "Emma Wilson",
      phone: "0412 345 004",
      pets: [{ name: "Luna", breed: "Miniature Schnauzer", sizeBand: "SMALL", coatType: "Wiry", photoUrl: "/seed-images/luna-schnauzer.jpg" }],
    },
    {
      email: "liam.obrien@example.com",
      name: "Liam O'Brien",
      phone: "0412 345 005",
      pets: [{ name: "Rocky", breed: "Staffordshire Terrier", sizeBand: "MEDIUM", coatType: "Short", photoUrl: "/seed-images/rocky-staffy.jpg" }],
    },
    {
      email: "chloe.nguyen@example.com",
      name: "Chloe Nguyen",
      phone: "0412 345 006",
      pets: [{ name: "Daisy", breed: "Golden Retriever", sizeBand: "LARGE", coatType: "Long, double coat", photoUrl: "/seed-images/daisy-golden.jpg" }],
    },
    {
      email: "noah.anderson@example.com",
      name: "Noah Anderson",
      phone: "0412 345 007",
      pets: [
        { name: "Milo", breed: "Toy Poodle", sizeBand: "SMALL", coatType: "Curly, non-shedding", photoUrl: "/seed-images/milo-poodle.jpg" },
        { name: "Coco", breed: "Kelpie", sizeBand: "MEDIUM", coatType: "Short", photoUrl: "/seed-images/coco-kelpie.jpg" },
      ],
    },
    {
      email: "ava.martinez@example.com",
      name: "Ava Martinez",
      phone: "0412 345 008",
      pets: [{ name: "Zeus", breed: "Bernese Mountain Dog", sizeBand: "LARGE", coatType: "Long, thick, double coat", photoUrl: "/seed-images/zeus-bernese.jpg" }],
    },
  ];

  type SizeBand = "SMALL" | "MEDIUM" | "LARGE" | "XL";
  const petByName = new Map<string, { petId: string; clientId: string; sizeBand: SizeBand; photoUrl: string }>();
  for (const c of clientDefs) {
    const user = await createUser(c.email, c.name, "ClientPass123!", "client");
    const client = await prisma.client.create({ data: { userId: user.id, phone: c.phone } });
    for (const p of c.pets) {
      const pet = await prisma.pet.create({
        data: {
          clientId: client.id,
          name: p.name,
          breed: p.breed,
          sizeBand: p.sizeBand,
          coatType: p.coatType,
          photoUrl: p.photoUrl,
        },
      });
      petByName.set(p.name, { petId: pet.id, clientId: client.id, sizeBand: p.sizeBand, photoUrl: p.photoUrl });
    }
  }

  console.log("Appointments, photos & payments...");

  function priceFor(slug: string, sizeBand: string) {
    const svc = serviceDefs.find((s) => s.slug === slug)!;
    const row = svc.prices.find((p) => p.sizeBand === sizeBand) ?? svc.prices.find((p) => p.sizeBand === null);
    return row?.priceCents ?? 0;
  }

  async function bookAppointment(opts: {
    petName: string;
    serviceSlug: string;
    daysOffset: number;
    startTime: string;
    status: "COMPLETED" | "CONFIRMED" | "PENDING_PAYMENT";
    groomerNote?: string;
    photoCaption?: string;
  }) {
    const pet = petByName.get(opts.petName)!;
    const service = serviceDefs.find((s) => s.slug === opts.serviceSlug)!;
    const serviceId = serviceIdBySlug.get(opts.serviceSlug)!;
    const startAt = atOffset(opts.daysOffset, opts.startTime);
    const endAt = new Date(startAt.getTime() + service.durationMinutes * 60 * 1000);
    const totalPriceCents = priceFor(opts.serviceSlug, pet.sizeBand);
    const depositCents = Math.round(totalPriceCents * 0.2);

    const appointment = await prisma.appointment.create({
      data: {
        clientId: pet.clientId,
        petId: pet.petId,
        primaryServiceId: serviceId,
        startAt,
        endAt,
        status: opts.status,
        sizeBandAtBooking: pet.sizeBand,
        totalPriceCents,
        depositPriceCents: depositCents,
        groomerNote: opts.groomerNote,
      },
    });

    if (opts.status === "COMPLETED") {
      await prisma.payment.create({
        data: {
          appointmentId: appointment.id,
          type: "DEPOSIT",
          amountCents: depositCents,
          status: "PAID",
          method: "STRIPE",
          paidAt: new Date(startAt.getTime() - 2 * DAY_MS),
        },
      });
      const balance = totalPriceCents - depositCents;
      if (balance > 0) {
        await prisma.payment.create({
          data: {
            appointmentId: appointment.id,
            type: "BALANCE",
            amountCents: balance,
            status: "PAID",
            method: "CASH",
            paidAt: endAt,
          },
        });
      }
      if (opts.photoCaption) {
        await prisma.appointmentPhoto.create({
          data: {
            appointmentId: appointment.id,
            url: pet.photoUrl,
            caption: opts.photoCaption,
            isFeaturedOnPublicGallery: true,
          },
        });
      }
    } else if (opts.status === "CONFIRMED") {
      await prisma.payment.create({
        data: {
          appointmentId: appointment.id,
          type: "DEPOSIT",
          amountCents: depositCents,
          status: "PAID",
          method: "STRIPE",
          paidAt: new Date(),
        },
      });
    } else {
      await prisma.payment.create({
        data: { appointmentId: appointment.id, type: "DEPOSIT", amountCents: depositCents, status: "PENDING", method: "STRIPE" },
      });
    }

    return appointment;
  }

  // Past, completed appointments (with photos + notes)
  await bookAppointment({
    petName: "Bella",
    serviceSlug: "full-groom",
    daysOffset: -21,
    startTime: "10:00",
    status: "COMPLETED",
    groomerNote: "Lovely as always, no matting. Did a teddy-bear face trim as requested.",
    photoCaption: "Bella after her Full Groom — teddy-bear face trim",
  });
  await bookAppointment({
    petName: "Max",
    serviceSlug: "deshed",
    daysOffset: -18,
    startTime: "09:30",
    status: "COMPLETED",
    groomerNote: "Heavy shed this visit (seasonal blow-out) — took a little longer than usual, coat is much lighter now.",
    photoCaption: "Max post-deshed — so much loose undercoat removed!",
  });
  await bookAppointment({
    petName: "Charlie",
    serviceSlug: "groom-out",
    daysOffset: -14,
    startTime: "11:00",
    status: "COMPLETED",
    groomerNote: "Slight matting behind the ears, worked through it gently. Charlie was a champion.",
    photoCaption: "Charlie's groom-out — fresh and tangle-free",
  });
  await bookAppointment({
    petName: "Milo",
    serviceSlug: "full-groom",
    daysOffset: -10,
    startTime: "13:00",
    status: "COMPLETED",
    groomerNote: "Kept the legs a little longer per Noah's request.",
    photoCaption: "Milo's fresh Full Groom",
  });
  await bookAppointment({
    petName: "Daisy",
    serviceSlug: "groom-out",
    daysOffset: -7,
    startTime: "09:00",
    status: "COMPLETED",
    groomerNote: "Ears were a bit waxy — gave them an extra clean and flagged it for the owner to keep an eye on.",
    photoCaption: "Daisy looking fluffy after her groom-out",
  });

  // Upcoming, confirmed (deposit paid)
  await bookAppointment({ petName: "Rocky", serviceSlug: "wash-and-dry", daysOffset: 2, startTime: "10:00", status: "CONFIRMED" });
  await bookAppointment({ petName: "Ruby", serviceSlug: "wash-and-tidy", daysOffset: 3, startTime: "14:00", status: "CONFIRMED" });
  await bookAppointment({ petName: "Coco", serviceSlug: "deshed", daysOffset: 4, startTime: "09:30", status: "CONFIRMED" });

  // Upcoming, awaiting deposit
  await bookAppointment({ petName: "Luna", serviceSlug: "full-groom", daysOffset: 6, startTime: "11:00", status: "PENDING_PAYMENT" });
  await bookAppointment({ petName: "Zeus", serviceSlug: "groom-out", daysOffset: 8, startTime: "09:00", status: "PENDING_PAYMENT" });

  console.log("✅ Seed complete.");
  console.log("\nDemo logins (all created via Better Auth email/password):");
  console.log("  Owner:  owner@trimsandbubbles.example / OwnerPass123!");
  console.log("  Staff:  staff@trimsandbubbles.example / StaffPass123!");
  console.log("  Client: sarah.thompson@example.com / ClientPass123!  (and 7 other demo clients, same password)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
