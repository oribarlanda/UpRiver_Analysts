import { Role } from "./types";

export function getRoleLandingPath(role: Role): string {
  return role === "admin" ? "/admin" : "/week/current";
}
