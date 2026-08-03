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
  } finally {
    await database.$disconnect();
  }

  console.log(`Seeded ${inspirations.length} inspirations`);
}

void main();
