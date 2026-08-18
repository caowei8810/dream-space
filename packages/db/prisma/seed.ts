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
          status: "ARCHIVED",
          publishedAt: null,
        },
        create: {
          ...inspiration,
          status: "ARCHIVED",
          publishedAt: null,
        },
      });
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
      "risk-rules:read": "查看提示词风控规则",
      "risk-rules:write": "编辑提示词风控规则草稿",
      "risk-rules:publish": "发布和下线提示词风控规则",
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
