import { createDatabaseClient, type DatabaseClient } from "@dream-space/db";
import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";

export const DATABASE_CLIENT = Symbol("DATABASE_CLIENT");

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CLIENT,
      useFactory: () => createDatabaseClient(),
    },
  ],
  exports: [DATABASE_CLIENT],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async onApplicationShutdown() {
    await this.database.$disconnect();
  }
}
