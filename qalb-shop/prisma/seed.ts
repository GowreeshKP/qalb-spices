import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCTS = [
  {
    slug: "black-pepper-whole",
    name: "Black pepper, whole",
    description: "Bold, aromatic peppercorns with a clean, lingering heat. Best cracked fresh over anything.",
    category: "whole",
    flavour: "Sharp, woody, warm",
    packSize: "100 g",
    priceCents: 34900,
    stock: 120,
    imageUrl: "/images/black-pepper.jpg",
  },
  {
    slug: "green-cardamom",
    name: "Green cardamom",
    description: "Sweet, floral pods, hand-picked and slowly dried. Lovely in chai, rice and baking.",
    category: "whole",
    flavour: "Floral, citrus, cool",
    packSize: "50 g",
    priceCents: 54900,
    stock: 80,
    imageUrl: "/images/cardamom.jpg",
  },
  {
    slug: "cinnamon-quills",
    name: "Cinnamon quills",
    description: "Delicate, warm and sweet, rolled by hand into fine layers. Brings depth to sweet and savoury dishes.",
    category: "whole",
    flavour: "Sweet, warm, gentle",
    packSize: "80 g",
    priceCents: 29900,
    stock: 60,
    imageUrl: "/images/cinnamon.jpg",
  },
  {
    slug: "turmeric-powder",
    name: "Turmeric powder",
    description: "Earthy and deeply golden, ground from whole roots. The quiet heart of a good curry.",
    category: "ground",
    flavour: "Earthy, mild, slightly bitter",
    packSize: "150 g",
    priceCents: 19900,
    stock: 150,
    imageUrl: "/images/turmeric.jpg",
  },
  {
    slug: "cloves-whole",
    name: "Cloves, whole",
    description: "Intensely fragrant buds with a sweet, numbing warmth. A little goes a long way.",
    category: "whole",
    flavour: "Pungent, sweet, spiced",
    packSize: "50 g",
    priceCents: 27900,
    stock: 3,
    imageUrl: "/images/cloves.jpg",
  },
  {
    slug: "red-chilli",
    name: "Red chilli",
    description: "Sun-dried chillies with a bright, rounded heat. Use whole, as flakes, or ground.",
    category: "ground",
    flavour: "Fruity, smoky, hot",
    packSize: "100 g",
    priceCents: 22900,
    stock: 90,
    imageUrl: "/images/chilli.jpg",
  },
  {
    slug: "qalb-garam-masala",
    name: "QALB garam masala",
    description: "Our house blend of pepper, cardamom, cinnamon, cloves and cumin, ground in small batches.",
    category: "blend",
    flavour: "Warm, rounded, fragrant",
    packSize: "75 g",
    priceCents: 32900,
    stock: 70,
    imageUrl: "/images/lifestyle.jpg",
  },
  {
    slug: "old-season-mace",
    name: "Mace blades (archived)",
    description: "Last season's mace, kept here to show how archived products are hidden from the shop.",
    category: "whole",
    flavour: "Delicate, nutmeg-like",
    packSize: "30 g",
    priceCents: 69900,
    stock: 0,
    status: "ARCHIVED",
    imageUrl: null,
  },
] as const;

async function main(): Promise<void> {
  const cost = Number(process.env.BCRYPT_COST ?? "12");
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@qalb.test").toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "Admin#12345";
  const userEmail = (process.env.SEED_USER_EMAIL ?? "user@qalb.test").toLowerCase();
  const userPassword = process.env.SEED_USER_PASSWORD ?? "User#12345";

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: "ADMIN" },
    create: { email: adminEmail, name: "QALB Admin", role: "ADMIN", passwordHash: await bcrypt.hash(adminPassword, cost) },
  });
  await prisma.user.upsert({
    where: { email: userEmail },
    update: {},
    create: { email: userEmail, name: "Demo Customer", role: "USER", passwordHash: await bcrypt.hash(userPassword, cost) },
  });

  for (const product of PRODUCTS) {
    const { slug, ...rest } = product;
    await prisma.product.upsert({
      where: { slug },
      update: {},
      create: { slug, ...rest, status: "status" in rest ? rest.status : "ACTIVE" },
    });
  }

  console.log("Seeded database.");
  console.log(`  Admin: ${adminEmail} / ${adminPassword}`);
  console.log(`  User:  ${userEmail} / ${userPassword}`);
  console.log(`  Products: ${PRODUCTS.length}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
