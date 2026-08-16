import { Module } from "@nestjs/common";
import { GenerationModule } from "../generation/generation.module";
import { InspirationsController } from "./inspirations.controller";
import { InspirationsRepository } from "./inspirations.repository";
import { InspirationsService } from "./inspirations.service";

@Module({
  imports: [GenerationModule],
  controllers: [InspirationsController],
  providers: [InspirationsRepository, InspirationsService],
})
export class InspirationsModule {}
