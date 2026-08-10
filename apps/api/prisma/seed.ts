import { PrismaClient } from "@prisma/client";

// The onsite service comes up ready to use: default facility settings so the
// desk has a rate/capacity from day one. The FIRST admin account is created
// through the app's one-time setup screen (POST /auth/register-first-admin),
// not seeded — so no default password ever ships.
const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.facilitySettings.findFirst();
  if (!existing) {
    await prisma.facilitySettings.create({
      data: {
        name: "CrecheMate",
        capacity: 20,
        hourlyRateCents: 1000,
        openTime: "07:00",
        closeTime: "18:00",
      },
    });
    console.log("Created default facility settings.");
  } else {
    console.log("Facility settings already exist — nothing to seed.");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
