import { z } from "zod";
import { isValidWeekStart } from "./dates";

export const employeeSchema = z.enum(["hila", "yaara", "omer"]);
export const roleSchema = z.enum(["hila", "yaara", "omer", "admin"]);
export const shiftTypeSchema = z.enum(["morning", "afternoon", "evening"]);
export const preferenceValueSchema = z.enum(["want", "can", "prefer_not", "cannot"]);
export const weekStatusSchema = z.enum(["open", "draft", "published"]);

// Minimum PIN length policy: employees need 6+ digits, admin needs 8+.
export const MIN_PIN_LENGTH: Record<z.infer<typeof roleSchema>, number> = {
  hila: 6,
  yaara: 6,
  omer: 6,
  admin: 8,
};

/** Validates both the string SHAPE (YYYY-MM-DD) and that it is a real
 * calendar date landing on a Sunday - not just a regex match. */
export const weekStartSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "week_start must be an ISO date (YYYY-MM-DD)")
  .refine(isValidWeekStart, { message: "week_start חייב להיות תאריך אמיתי שחל ביום ראשון." });

export const loginSchema = z
  .object({
    role: roleSchema,
    pin: z
      .string()
      .regex(/^\d+$/, "קוד ה-PIN חייב להכיל ספרות בלבד.")
      .max(20),
  })
  .refine((data) => data.pin.length >= MIN_PIN_LENGTH[data.role], {
    message: "קוד ה-PIN קצר מדי.",
    path: ["pin"],
  });

export const savePreferenceSchema = z.object({
  weekStart: weekStartSchema,
  employee: employeeSchema,
  dayIndex: z.number().int().min(0).max(6),
  shiftType: shiftTypeSchema,
  preference: preferenceValueSchema,
});

export const savePreferencesBulkSchema = z.object({
  weekStart: weekStartSchema,
  employee: employeeSchema,
  entries: z
    .array(
      z.object({
        dayIndex: z.number().int().min(0).max(6),
        shiftType: shiftTypeSchema,
        preference: preferenceValueSchema,
      })
    )
    .min(1),
});

export const premiumDaysSchema = z.object({
  weekStart: weekStartSchema,
  premiumDays: z.array(z.number().int().min(0).max(6)),
});

export const generateSchema = z.object({
  weekStart: weekStartSchema,
});

export const manualAssignmentSchema = z.object({
  weekStart: weekStartSchema,
  dayIndex: z.number().int().min(0).max(6),
  shiftType: shiftTypeSchema,
  employee: employeeSchema.nullable(),
});

export const publishSchema = z.object({
  weekStart: weekStartSchema,
});

export const reopenSchema = z.object({
  weekStart: weekStartSchema,
  toStatus: z.enum(["open", "draft"]).default("open"),
});
