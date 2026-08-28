import { adminDemoPhone, adminPermissions, adminViewerDemoPhone } from "@dream-space/contracts";
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
          status: "PUBLISHED",
          publishedAt: new Date(inspiration.publishedAt),
        },
        create: {
          ...inspiration,
          status: "PUBLISHED",
          publishedAt: new Date(inspiration.publishedAt),
        },
      });
    }
    const demoProvider = await database.provider.upsert({
      where: { code: "mock" },
      update: { name: "本地模拟供应商", status: "ACTIVE", timeoutMs: 30000, retryLimit: 2 },
      create: { code: "mock", name: "本地模拟供应商", status: "ACTIVE", timeoutMs: 30000, retryLimit: 2 },
    });
    for (const model of [
      { code: "image-4.7", name: "通用模型", providerModelId: "image-4.7", visible: true },
      { code: "image-realistic", name: "写实模型", providerModelId: "image-realistic", visible: true },
      { code: "image-anime", name: "动漫模型", providerModelId: "image-anime", visible: true },
    ]) {
      const record = await database.model.upsert({
        where: { code: model.code },
        update: { name: model.name, providerId: demoProvider.id, providerModelId: model.providerModelId, status: "PUBLISHED", visible: model.visible, capabilities: { ratios: ["smart", "21:9", "16:9", "3:2", "4:3", "1:1", "3:4", "2:3", "9:16"], resolutions: ["2K", "4K"], maxImageCount: 8 } },
        create: { ...model, providerId: demoProvider.id, status: "PUBLISHED", capabilities: { ratios: ["smart", "21:9", "16:9", "3:2", "4:3", "1:1", "3:4", "2:3", "9:16"], resolutions: ["2K", "4K"], maxImageCount: 8 } },
      });
      const existing = await database.modelConfigVersion.findFirst({ where: { modelId: record.id, status: "PUBLISHED" } });
      if (!existing) await database.modelConfigVersion.create({ data: { modelId: record.id, version: 1, status: "PUBLISHED", config: { temperature: 0.7 }, reason: "初始化模型配置", publishedAt: new Date() } });
      await database.modelRoute.upsert({ where: { modelId_providerId: { modelId: record.id, providerId: demoProvider.id } }, update: { enabled: true, health: "healthy" }, create: { modelId: record.id, providerId: demoProvider.id, enabled: true, health: "healthy", weight: 100, priority: 0 } });
    }
    const permissionNames: Record<(typeof adminPermissions)[number], string> = {
      "dashboard:read": "查看运营总览",
      "tasks:read": "查看生成任务",
      "inspirations:read": "查看灵感",
      "inspirations:publish": "发布灵感精选",
      "admin-accounts:read": "查看管理员账号",
      "admin-accounts:write": "管理管理员账号",
      "admin-sessions:revoke": "撤销管理员会话",
      "users:read": "查看注册用户",
      "users:write": "处置注册用户状态",
      "user-sessions:revoke": "撤销用户会话",
      "roles:read": "查看角色与权限",
      "roles:write": "管理角色与权限",
      "permissions:read": "查看权限点",
      "audit:read": "查看操作审计日志",
      "risk-rules:read": "查看提示词风控规则",
      "risk-rules:write": "编辑提示词风控规则草稿",
      "risk-rules:publish": "发布和下线提示词风控规则",
      "moderation:read": "查看人工审核队列和申诉",
      "moderation:write": "领取并处理人工审核和申诉",
      "billing:read": "查看计费规则和钱包",
      "billing:write": "编辑计费规则和钱包调整",
      "billing:publish": "发布计费规则",
      "plans:read": "查看套餐",
      "plans:write": "编辑套餐",
      "plans:publish": "发布套餐",
      "refunds:create": "发起退款",
      "models:read": "查看模型配置",
      "models:write": "编辑模型配置",
      "models:publish": "发布与回滚模型配置",
      "privacy:read": "查看隐私请求",
      "privacy:write": "处理账户删除请求",
    };
    for (const code of adminPermissions) {
      await database.adminPermission.upsert({
        where: { code },
        update: { name: permissionNames[code], active: true },
        create: {
          code,
          name: permissionNames[code],
          description: permissionNames[code],
          risk: code === "admin-accounts:write" ? "HIGH" : "LOW",
          active: true,
        },
      });
    }
    const ownerRole = await database.adminRole.upsert({
      where: { code: "owner" },
      update: { name: "系统负责人", active: true },
      create: {
        code: "owner",
        name: "系统负责人",
        description: "平台最高权限角色",
        system: true,
        active: true,
      },
    });
    const viewerRole = await database.adminRole.upsert({
      where: { code: "viewer" },
      update: { name: "只读审阅员", active: true },
      create: {
        code: "viewer",
        name: "只读审阅员",
        description: "只读查看任务和灵感",
        system: true,
        active: true,
      },
    });
    const permissions = await database.adminPermission.findMany();
    await database.adminRolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: ownerRole.id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });
    await database.adminRolePermission.createMany({
      data: permissions
        .filter((permission) =>
          ["dashboard:read", "tasks:read", "inspirations:read"].includes(permission.code),
        )
        .map((permission) => ({ roleId: viewerRole.id, permissionId: permission.id })),
      skipDuplicates: true,
    });
    const owner = await database.adminUser.upsert({
      where: { phone: adminDemoPhone },
      update: { employeeNo: "ADM0001", displayName: "本地管理员", status: "ACTIVE" },
      create: {
        employeeNo: "ADM0001",
        phone: adminDemoPhone,
        displayName: "本地管理员",
        status: "ACTIVE",
      },
    });
    const viewer = await database.adminUser.upsert({
      where: { phone: adminViewerDemoPhone },
      update: { employeeNo: "ADM0002", displayName: "本地审阅员", status: "ACTIVE" },
      create: {
        employeeNo: "ADM0002",
        phone: adminViewerDemoPhone,
        displayName: "本地审阅员",
        status: "ACTIVE",
      },
    });
    await database.adminUserRole.createMany({
      data: [
        { adminUserId: owner.id, roleId: ownerRole.id },
        { adminUserId: viewer.id, roleId: viewerRole.id },
      ],
      skipDuplicates: true,
    });
  } finally {
    await database.$disconnect();
  }

  console.log(`Seeded ${inspirations.length} inspirations and two demo administrators`);
}

void main();
