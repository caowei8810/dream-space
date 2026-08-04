import { adminDemoPhone } from "@dream-space/contracts";
import { createDatabaseClient } from "../src";
import inspirations from "./seed-data/inspirations.json";

async function main() {
  const database = createDatabaseClient();

  try {
    for (const inspiration of inspirations) {
      await database.inspiration.upsert({
        where: { slug: inspiration.slug },
        update: {
          ...inspiration,
          publishedAt: new Date(inspiration.publishedAt),
        },
        create: {
          ...inspiration,
          publishedAt: new Date(inspiration.publishedAt),
        },
      });
    }
    await database.adminUser.upsert({
      where: { phone: adminDemoPhone },
      update: { displayName: "本地管理员", role: "ADMIN", active: true },
      create: {
        phone: adminDemoPhone,
        displayName: "本地管理员",
        role: "ADMIN",
        active: true,
      },
    });
  } finally {
    await database.$disconnect();
  }

  console.log(`Seeded ${inspirations.length} inspirations and one demo administrator`);
}

void main();
