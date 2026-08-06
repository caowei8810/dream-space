import { describe, expect, it, vi } from "vitest";
import { AdminTasksService } from "../src/modules/admin/admin-tasks.service";

const task = {
  id: "task-1",
  sessionId: "session-1",
  status: "SUCCEEDED",
  prompt: "雨后的玻璃花房",
  model: "image-4.7",
  ratio: "1:1",
  resolution: "2K",
  imageCount: 2,
  totalCost: 2,
  attempts: 1,
  referenceImageUrls: [],
  errorCode: null,
  errorMessage: null,
  inputModerationStatus: "APPROVED",
  outputModerationStatus: "APPROVED",
  createdAt: new Date("2026-08-03T01:00:00Z"),
  startedAt: new Date("2026-08-03T01:00:01Z"),
  completedAt: new Date("2026-08-03T01:00:05Z"),
  user: { phone: "13800138000" },
  session: { title: "雨后的玻璃花房" },
  _count: { results: 2 },
  deadLetter: null,
};

describe("admin tasks service", () => {
  it("validates filters and maps paginated task results", async () => {
    const repository = {
      list: vi.fn().mockResolvedValue({ items: [task], total: 21 }),
      findById: vi.fn(),
    };
    const service = new AdminTasksService(repository as never);

    const result = await service.list({
      status: "succeeded",
      model: "image-4.7",
      query: "花房",
      page: "2",
      pageSize: "10",
    });

    expect(repository.list).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "SUCCEEDED",
        model: "image-4.7",
        query: "花房",
        page: 2,
        pageSize: 10,
      }),
    );
    expect(result).toMatchObject({ page: 2, pageSize: 10, pageCount: 3, total: 21 });
    expect(result.items[0]).toMatchObject({
      userPhoneMasked: "138****8000",
      status: "succeeded",
      resultCount: 2,
      attempts: 1,
    });
  });

  it("includes the entire selected end date", async () => {
    const repository = {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      findById: vi.fn(),
    };
    const service = new AdminTasksService(repository as never);

    await service.list({ createdFrom: "2026-08-03", createdTo: "2026-08-03" });

    expect(repository.list).toHaveBeenCalledWith(
      expect.objectContaining({
        createdFrom: new Date("2026-08-03T00:00:00.000+08:00"),
        createdTo: new Date("2026-08-03T23:59:59.999+08:00"),
      }),
    );
  });

  it("rejects unsupported status, date order, and page values", async () => {
    const repository = { list: vi.fn(), findById: vi.fn() };
    const service = new AdminTasksService(repository as never);

    await expect(service.list({ status: "unknown" })).rejects.toThrow("任务状态不正确");
    await expect(
      service.list({ createdFrom: "2026-08-04", createdTo: "2026-08-03" }),
    ).rejects.toThrow("开始时间不能晚于结束时间");
    await expect(service.list({ page: "0" })).rejects.toThrow("页码不正确");
  });

  it("maps stored objects to protected admin asset routes", async () => {
    const repository = {
      list: vi.fn(),
      findById: vi.fn().mockResolvedValue({
        ...task,
        results: [
          {
            id: "result-1",
            index: 0,
            imagePath: "/legacy.webp",
            objectKey: "results/task-1/result-1.webp",
            thumbnailObjectKey: "thumbnails/task-1/result-1.webp",
            width: 2048,
            height: 2048,
            mimeType: "image/webp",
            byteSize: 1024,
            moderationStatus: "APPROVED",
          },
        ],
      }),
    };
    const service = new AdminTasksService(repository as never);

    await expect(service.get("task-1")).resolves.toMatchObject({
      results: [
        {
          imageUrl: "http://localhost:4000/admin/tasks/results/result-1/content",
          thumbnailUrl: "http://localhost:4000/admin/tasks/results/result-1/thumbnail",
          moderationStatus: "approved",
        },
      ],
    });
  });

  it("exposes a persistent dead letter in task details", async () => {
    const repository = {
      list: vi.fn(),
      findById: vi.fn().mockResolvedValue({
        ...task,
        status: "FAILED",
        attempts: 3,
        results: [],
        deadLetter: {
          errorCode: "PROVIDER_TEMPORARILY_UNAVAILABLE",
          errorMessage: "provider unavailable",
          attempts: 3,
          createdAt: new Date("2026-08-06T01:00:00Z"),
          resolvedAt: null,
        },
      }),
    };
    const service = new AdminTasksService(repository as never);

    await expect(service.get("task-1")).resolves.toMatchObject({
      status: "failed",
      attempts: 3,
      deadLetter: {
        errorCode: "PROVIDER_TEMPORARILY_UNAVAILABLE",
        attempts: 3,
        resolvedAt: null,
      },
    });
  });
});
