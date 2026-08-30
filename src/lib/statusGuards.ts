import { WeekStatus } from "./types";

/** Thrown by the guard functions below; API routes catch this and respond
 * with 409 + the Hebrew message, so the same rule is enforced identically
 * everywhere (never only hidden in the UI). */
export class StatusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StatusError";
  }
}

/** Preferences may only be written while the week is open. */
export function assertPreferencesEditable(status: WeekStatus): void {
  if (status !== "open") {
    throw new StatusError("ניתן לערוך העדפות רק כאשר השבוע במצב פתוח.");
  }
}

/** Premium days may be changed any time except after publication. */
export function assertPremiumDaysEditable(status: WeekStatus): void {
  if (status === "published") {
    throw new StatusError("לא ניתן לשנות ימי פרמיה לאחר פרסום השבוע. יש לפתוח מחדש.");
  }
}

/** The DP schedule may be (re)generated any time except after publication. */
export function assertGeneratable(status: WeekStatus): void {
  if (status === "published") {
    throw new StatusError("לא ניתן ליצור שיבוץ חדש לשבוע שפורסם. יש לפתוח מחדש.");
  }
}

/** Generation is blocked until all employees have answered every configured shift. */
export function assertPreferencesComplete(missingPreferenceCount: number): void {
  if (missingPreferenceCount > 0) {
    throw new StatusError("לא ניתן ליצור שיבוץ - חסרות תשובות העדפה. יש להשלים את כל המשמרות המוגדרות עבור שלוש העובדות.");
  }
}

/** Manual assignment edits are only allowed once a draft schedule exists,
 * and before it has been published. */
export function assertAssignmentsEditable(status: WeekStatus): void {
  if (status === "open") {
    throw new StatusError("יש לסגור העדפות וליצור שיבוץ תחילה.");
  }
  if (status === "published") {
    throw new StatusError("השבוע פורסם ולא ניתן לשנות שיבוץ. יש לפתוח מחדש.");
  }
}

/** Publishing requires a draft week with every configured shift assigned. */
export function assertPublishable(status: WeekStatus, missingAssignmentCount: number): void {
  if (status !== "draft") {
    throw new StatusError("ניתן לפרסם רק שבוע שנמצא במצב טיוטה.");
  }
  if (missingAssignmentCount > 0) {
    throw new StatusError("לא ניתן לפרסם - קיימות משמרות שלא שובצו.");
  }
}

/** Reopen only ever moves the week "backward" in its lifecycle:
 *   draft     -> open   (allowed - reopen for more preference editing)
 *   published -> draft  (allowed - reopen for schedule editing)
 *   published -> open   (allowed - reopen all the way back to preferences)
 *   open      -> draft  (NOT allowed - draft is only ever reached via generate)
 *   any status -> itself (NOT allowed - not a meaningful transition)
 * Any other combination is rejected. */
const ALLOWED_REOPEN_TRANSITIONS: Record<WeekStatus, WeekStatus[]> = {
  open: [],
  draft: ["open"],
  published: ["draft", "open"],
};

export function assertReopenable(fromStatus: WeekStatus, toStatus: WeekStatus): void {
  if (fromStatus === toStatus) {
    throw new StatusError("השבוע כבר נמצא במצב המבוקש.");
  }
  if (!ALLOWED_REOPEN_TRANSITIONS[fromStatus].includes(toStatus)) {
    throw new StatusError(`לא ניתן לפתוח מחדש שבוע ממצב "${fromStatus}" למצב "${toStatus}".`);
  }
}
