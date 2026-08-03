import { generationQueueName, type GenerationQueueJob } from "@dream-space/contracts";
import { parseApiEnv } from "@dream-space/config";
import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import IORedis from "ioredis";

@Injectable()
export class GenerationQueue implements OnModuleDestroy {
  private readonly connection: IORedis;
  private readonly queue: Queue<GenerationQueueJob>;

  constructor() {
    const env = parseApiEnv(process.env);
    this.connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
    this.queue = new Queue<GenerationQueueJob>(generationQueueName, {
      connection: this.connection,
    });
  }

  async enqueue(taskId: string) {
    const job = await this.queue.add(
      "generate",
      { taskId },
      {
        jobId: taskId,
        attempts: 3,
        backoff: { type: "exponential", delay: 500 },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
    return String(job.id);
  }

  async onModuleDestroy() {
    await this.queue.close();
    await this.connection.quit();
  }
}
