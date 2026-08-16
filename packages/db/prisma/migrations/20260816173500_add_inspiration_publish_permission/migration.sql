INSERT INTO "AdminPermission" ("id", "code", "name", "description", "risk", "active", "createdAt", "updatedAt")
VALUES ('permission-inspirations-publish', 'inspirations:publish', '发布灵感精选', '从审核通过的用户生成图片发布灵感', 'MEDIUM', true, NOW(), NOW())
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "description" = EXCLUDED."description", "active" = true, "updatedAt" = NOW();

INSERT INTO "AdminRolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "AdminRole" r
JOIN "AdminPermission" p ON p."code" = 'inspirations:publish'
WHERE r."code" = 'owner'
ON CONFLICT DO NOTHING;
