export const adminSessionCookieName = "dreamspace_admin_session";

export function readAdminSessionToken(header: string | undefined) {
  const pair = header
    ?.split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${adminSessionCookieName}=`));
  if (!pair) return null;
  try {
    return decodeURIComponent(pair.slice(adminSessionCookieName.length + 1));
  } catch {
    return null;
  }
}
