export const sessionCookieName = "dreamspace_session";

export function readSessionToken(header: string | undefined) {
  const pair = header
    ?.split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${sessionCookieName}=`));
  if (!pair) return null;
  try {
    return decodeURIComponent(pair.slice(sessionCookieName.length + 1));
  } catch {
    return null;
  }
}
