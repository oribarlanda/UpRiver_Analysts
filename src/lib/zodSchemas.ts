import { z } from "zod";
import { isValidISODate, isValidWeekStart } from "./dates";
import {
  ALGORITHM_PRIORITY_IDS,
  MAX_SHIFTS_PER_DAY,
  SHIFT_ID_PATTERN,
} from "./types";

export const employeeSchema = z.enum(["hila", "yaara", "omer"]);
export const roleSchema = z.enum(["hila", "yaara", "omer", "admin"]);
export const shiftTypeSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(
    SHIFT_ID_PATTERN,
    "מזהה משמרת יכול להכיל רק אותיות אנגליות קטנות, ספרות וקו תחתון."
  );
export const preferenceValueSchema = z.enum(["want", "can", "prefer_not", "cannot"]);
export const weekStatusSchema = z.enum(["open", "draft", "published"]);

export const algorithmPrioritySchema = z.enum(
  ALGORITHM_PRIORITY_IDS
);

export const algorithmPriorityOrderSchema = z
  .array(algorithmPrioritySchema)
  .length(
    ALGORITHM_PRIORITY_IDS.length,
    "יש לכלול את כל כללי התעדוף."
  )
  .refine(
    (priorities) =>
      new Set(priorities).size ===
      ALGORITHM_PRIORITY_IDS.length,
    "כל כלל תעדוף חייב להופיע פעם אחת בלבד."
  );

const payValueSchema = z
  .number()
  .finite()
  .min(0.125, "שווי משמרת חייב להיות לפחות 0.125.")
  .max(24, "שווי משמרת לא יכול לעלות על 24.")
  .refine(
    (value) => Math.abs(value * 8 - Math.round(value * 8)) < 1e-9,
    "שווי משמרת חייב להיות בכפולות של 0.125."
  );

const startTimeSchema = z
  .string()
  .regex(
    /^(?:[01]\d|2[0-3]):[0-5]\d$/,
    "שעת התחלה חייבת להיות בפורמט HH:mm."
  );

export const shiftDefinitionSchema = z.object({
  id: shiftTypeSchema,
  name: z.string().trim().min(1, "יש להזין שם למשמרת.").max(50),
  payValue: payValueSchema,
  startTime: startTimeSchema,
  durationMinutes: z
    .number()
    .int()
    .min(5, "אורך משמרת חייב להיות לפחות 5 דקות.")
    .max(1440, "אורך משמרת לא יכול לעלות על 24 שעות."),
});

export const shiftDefinitionsSchema = z
  .array(shiftDefinitionSchema)
  .min(1, "חייבת להיות לפחות משמרת אחת ביום.")
  .max(
    MAX_SHIFTS_PER_DAY,
    `ניתן להגדיר עד ${MAX_SHIFTS_PER_DAY} משמרות ביום.`
  )
  .superRefine((definitions, ctx) => {
    const seenIds = new Map<string, number>();
    const seenNames = new Map<string, number>();

    definitions.forEach((definition, index) => {
      const previousIdIndex = seenIds.get(definition.id);
      if (previousIdIndex !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "מזהה משמרת חייב להיות ייחודי.",
          path: [index, "id"],
        });
      } else {
        seenIds.set(definition.id, index);
      }

      const normalizedName = definition.name.toLocaleLowerCase("he-IL");
      const previousNameIndex = seenNames.get(normalizedName);
      if (previousNameIndex !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "שם משמרת חייב להיות ייחודי.",
          path: [index, "name"],
        });
      } else {
        seenNames.set(normalizedName, index);
      }
    });
  });

export const shiftSettingsSchema = z.object({
  shiftDefinitions: shiftDefinitionsSchema,
});

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

export const algorithmPrioritySettingsSchema = z.object({
  weekStart: weekStartSchema,
  priorities:
    algorithmPriorityOrderSchema.nullable(),
});

export const balanceWeekSettingsSchema = z.object({
  weekStart: weekStartSchema,
  enabled: z.boolean(),
});

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

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isValidISODate, "התאריך אינו תקין.");

export const preferenceQuickActionSchema = z
  .discriminatedUnion("action", [
    z.object({
      action: z.literal("copy_previous"),
      weekStart: weekStartSchema,
    }),
    z.object({
      action: z.literal("set_unavailable_range"),
      fromDate: isoDateSchema,
      toDate: isoDateSchema,
    }),
  ])
  .superRefine((value, context) => {
    if (
      value.action === "set_unavailable_range" &&
      value.fromDate > value.toDate
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "תאריך הסיום חייב להיות זהה לתאריך ההתחלה או מאוחר ממנו.",
        path: ["toDate"],
      });
    }
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

const pushKeySchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/);

const pushEndpointSchema = z
  .string()
  .url()
  .max(4096)
  .refine((value) => new URL(value).protocol === "https:");

export const pushSubscriptionSchema = z.object({
  endpoint: pushEndpointSchema,
  keys: z.object({
    p256dh: pushKeySchema,
    auth: pushKeySchema,
  }),
});

export const pushUnsubscribeSchema = z.object({
  endpoint: pushEndpointSchema,
});

export const notificationPreferencesSchema = z.object({
  schedulePublishedEnabled: z.boolean(),
  scheduleUpdatedEnabled: z.boolean(),
  preferenceRemindersEnabled: z.boolean(),
  preferenceReminders: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        time: z.string().regex(/^(?:[01][0-9]|2[0-3]):00$/),
      })
    )
    .max(10)
    .refine(
      (reminders) =>
        new Set(
          reminders.map(
            (reminder) => `${reminder.dayOfWeek}:${reminder.time}`
          )
        ).size ===
        reminders.length,
      "כל תזכורת יכולה להופיע פעם אחת בלבד."
    ),
});

export const reopenSchema = z.object({
  weekStart: weekStartSchema,
  toStatus: z.enum(["open", "draft"]).default("open"),
});
