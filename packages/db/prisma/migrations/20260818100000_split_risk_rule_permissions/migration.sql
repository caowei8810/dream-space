UPDATE "AdminPermission"
SET "code" = 'risk-rules:read', "name" = '查看提示词风控规则', "description" = '查看提示词风控规则和命中记录', "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'risk:read';

UPDATE "AdminPermission"
SET "code" = 'risk-rules:write', "name" = '编辑提示词风控规则草稿', "description" = '创建提示词风控规则草稿', "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'risk:write';

INSERT INTO "AdminPermission" ("id", "code", "name", "description", "risk", "active", "createdAt", "updatedAt")
VALUES ('permission-risk-rules-publish', 'risk-rules:publish', '发布和下线提示词风控规则', '发布和下线提示词风控规则', 'HIGH', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET "active" = true, "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "AdminRolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "AdminRole" r
JOIN "AdminPermission" p ON p."code" IN ('risk-rules:read', 'risk-rules:write', 'risk-rules:publish')
WHERE r."code" = 'owner'
ON CONFLICT DO NOTHING;
