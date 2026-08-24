INSERT INTO "AdminPermission" ("id", "code", "name", "description", "risk", "active", "createdAt", "updatedAt")
VALUES
  ('permission-moderation-read', 'moderation:read', '查看人工审核队列和申诉', '查看人工审核队列、审核证据和用户申诉', 'MEDIUM', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission-moderation-write', 'moderation:write', '处理人工审核和申诉', '领取、决定人工审核和处理申诉', 'HIGH', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET "active" = true, "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "AdminRolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "AdminRole" r
JOIN "AdminPermission" p ON p."code" IN ('moderation:read', 'moderation:write')
WHERE r."code" IN ('owner', 'operator')
ON CONFLICT DO NOTHING;
