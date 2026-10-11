/** Cookie holding the home the user last opened; bare /home, /plan, /ask and /energy redirect to it. */
export const LAST_HOME_COOKIE = "last_home_id";

/** Sections that show one home, at /{section}/{homeId}. */
export const HOME_SECTIONS = ["home", "plan", "ask", "energy"] as const;
export type HomeSection = (typeof HOME_SECTIONS)[number];

/** The home id in a /{section}/{homeId} path, else null. */
export function homeIdFromPath(pathname: string): string | null {
  const [, section, id] = pathname.split("/");
  return id && (HOME_SECTIONS as readonly string[]).includes(section) ? decodeURIComponent(id) : null;
}
