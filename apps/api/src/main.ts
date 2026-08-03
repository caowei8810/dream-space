import "reflect-metadata";
import { parseApiEnv } from "@dream-space/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const env = parseApiEnv(process.env);
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    credentials: true,
    origin: [env.WEB_ORIGIN, env.ADMIN_ORIGIN],
  });
  app.enableShutdownHooks();

  await app.listen(env.API_PORT);
  console.log(`Dream Space API listening on http://localhost:${env.API_PORT}`);
}

void bootstrap();
