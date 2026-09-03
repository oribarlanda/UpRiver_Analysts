export interface ChangelogBullet {
  icon: string;
  title: string;
  description: string;
}

export interface ChangelogEntry {
  date: string;
  bullets: readonly ChangelogBullet[];
}

/** Add new releases at the top so the UI always shows the latest first. */
export const CHANGELOG_ENTRIES = [
  {
    date: "03.09.2026",
    bullets: [
      {
        icon: "🔔",
        title: "התראות בדחיפה (Push Notifications)",
        description: "",
      },
      {
        icon: "↳",
        title: "🎉 התראה כשהשיבוץ מתפרסם או מתעדכן",
        description: "לפי העדפות ההתראות שלך.",
      },
      {
        icon: "↳",
        title: "⏰ תזכורות אישיות למילוי העדפות",
        description: "בחרי יום ושעה, ואפשר להוסיף כמה תזכורות.",
      },
      {
        icon: "↳",
        title: "⚙️ ניהול אישי של סוגי ההתראות",
        description: "דרך כפתור 🔔התראות.",
      },
    ],
  },
  {
    date: "01.09.2026",
    bullets: [
      {
        icon: "📋",
        title: "העתקת העדפות משבוע קודם + אי־זמינות לטווח תאריכים",
        description: "במסך ההעדפות.",
      },
      {
        icon: "📅",
        title: "עדכון יום שלם",
        description: "בלחיצה על שם היום או התאריך.",
      },
      {
        icon: "🗓️",
        title: "חיבור קבוע ליומן Google",
        description: "באזור היומן במסך השיבוץ.",
      },
      {
        icon: "📱",
        title: "התקנת UpRiver על מסך הבית",
        description: "דרך אפשרות ההתקנה.",
      },
      {
        icon: "✨",
        title: "זכירת המשתמש + שיפורי מובייל ותצוגה",
        description: "בכל האפליקציה.",
      },
    ],
  },
  {
    date: "29.08.2026",
    bullets: [
      {
        icon: "✅",
        title: "אישור שסיימת למלא העדפות",
        description: "במסך ההעדפות.",
      },
      {
        icon: "✏️",
        title: "אפשר להמשיך לערוך גם אחרי האישור",
        description: "עד סגירת השבוע.",
      },
      {
        icon: "🔔",
        title: "זיהוי שינויים מאז האישור",
        description: "מוצג אוטומטית לאחר עריכה.",
      },
    ],
  },
  {
    date: "20.08.2026",
    bullets: [
      {
        icon: "🗓️",
        title: "ייצוא כל המשמרות ליומן",
        description: "במסך השיבוץ המפורסם.",
      },
      {
        icon: "📆",
        title: "הוספת משמרת בודדת ליומן",
        description: "בלחיצה על המשמרת.",
      },
      {
        icon: "⏰",
        title: "שעות המשמרות נכנסות אוטומטית ליומן",
        description: "ללא הזנה ידנית.",
      },
    ],
  },
  {
    date: "15.08.2026",
    bullets: [
      {
        icon: "📤",
        title: "שיתוף השיבוץ השבועי כתמונה",
        description: "דרך כפתור השיתוף.",
      },
      {
        icon: "🎨",
        title: "שיבוץ צבעוני לפי עובדת",
        description: "במסך השיבוץ המפורסם.",
      },
      {
        icon: "📅",
        title: "תאריך נוסף לכל יום",
        description: "בתוך לוח השבוע.",
      },
    ],
  },
  {
    date: "10.08.2026",
    bullets: [
      {
        icon: "👍",
        title: "„יכולה” הפכה לברירת המחדל",
        description: "צריך לשנות רק חריגות.",
      },
      {
        icon: "🎯",
        title: "ארבע רמות העדפה ברורות",
        description: "רוצה במיוחד, יכולה, מעדיפה שלא, לא יכולה.",
      },
      {
        icon: "↔️",
        title: "ניווט מהיר בין שבועות",
        description: "מראש מסך ההעדפות.",
      },
    ],
  },
] as const satisfies readonly ChangelogEntry[];