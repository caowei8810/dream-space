import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { parseApiEnv } from "@dream-space/config";
import Redis from "ioredis";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

interface HttpRequest {
  method: string;
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

interface HttpResponse {
  setHeader(name: string, value: string): void;
  statusCode: number;
  end(body?: string): void;
}

type Next = () => void;

function headerValue(request: HttpRequest, name: string) {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

async function bootstrap() {
  const env = parseApiEnv(process.env);
  const app = await NestFactory.create(AppModule, { rawBody: true, bodyParser: true });

  const redis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  await redis.connect().catch(() => undefined);

  app.use(async (request: HttpRequest, response: HttpResponse, next: Next) => {
    const requestIdHeader = headerValue(request, "x-request-id");
    const requestId = requestIdHeader && /^[a-zA-Z0-9._:-]{1,128}$/.test(requestIdHeader)
      ? requestIdHeader
      : randomUUID();
    response.setHeader("X-Request-Id", requestId);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    if (env.NODE_ENV === "production") {
      response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }

    const origin = headerValue(request, "origin");
    const isMutation = !["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase());
    if (isMutation && origin && origin !== env.WEB_ORIGIN && origin !== env.ADMIN_ORIGIN) {
      response.statusCode = 403;
      response.end(JSON.stringify({ code: "CROSS_SITE_REQUEST_BLOCKED", requestId }));
      return;
    }

    if (isMutation) {
      const identity = headerValue(request, "authorization") ?? headerValue(request, "cookie") ?? request.ip ?? "unknown";
      const bucket = Math.floor(Date.now() / (env.RATE_LIMIT_WINDOW_SECONDS * 1000));
      const key = `rate:${bucket}:${request.method}:${identity.slice(0, 160)}`;
      try {
        if (redis.status === "ready") {
          const count = await redis.incr(key);
          if (count === 1) await redis.expire(key, env.RATE_LIMIT_WINDOW_SECONDS);
          response.setHeader("X-RateLimit-Limit", String(env.RATE_LIMIT_MAX_REQUESTS));
          response.setHeader("X-RateLimit-Remaining", String(Math.max(0, env.RATE_LIMIT_MAX_REQUESTS - count)));
          if (count > env.RATE_LIMIT_MAX_REQUESTS) {
            response.statusCode = 429;
            response.setHeader("Retry-After", String(env.RATE_LIMIT_WINDOW_SECONDS));
            response.end(JSON.stringify({ code: "RATE_LIMITED", requestId }));
            return;
          }
        } else if (env.NODE_ENV === "production") {
          response.statusCode = 503;
          response.end(JSON.stringify({ code: "RATE_LIMIT_UNAVAILABLE", requestId }));
          return;
        }
      } catch {
        if (env.NODE_ENV === "production") {
          response.statusCode = 503;
          response.end(JSON.stringify({ code: "RATE_LIMIT_UNAVAILABLE", requestId }));
          return;
        }
      }
    }
    next();
  });

  app.enableCors({
    credentials: true,
    origin: [env.WEB_ORIGIN, env.ADMIN_ORIGIN],
  });
  app.enableShutdownHooks();

  await app.listen(env.API_PORT);
  console.log(`Dream Space API listening on http://localhost:${env.API_PORT}`);
}

void bootstrap();
