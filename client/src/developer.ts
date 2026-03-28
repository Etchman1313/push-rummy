/** Only this account may open Developer Home in the client UI. */
export const DEVELOPER_USERNAME = "tim@eytcheson.net";

export function isDeveloperUser(username: string | undefined | null): boolean {
  if (!username) return false;
  return username.trim().toLowerCase() === DEVELOPER_USERNAME.toLowerCase();
}
