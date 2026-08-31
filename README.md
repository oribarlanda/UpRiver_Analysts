# שיבוץ שבועי — Weekly Shift Scheduler

מערכת שבועית לשיבוץ 3 עובדות (הילה, יערה, עומר) לפי העדפות, עם איזון אוטומטי
של יחידות השכר באמצעות אלגוריתם Dynamic Programming מדויק על כל משמרות
השבוע יחד (לא חמדני, לא לפי יום). מנהל יכול להגדיר את מבנה המשמרות,
המשקל באלגוריתם וזמני הייצוא ליומן.

Next.js 15 (App Router) · TypeScript · Tailwind CSS · Supabase Postgres ·
פריסה ל-Vercel.

## תוכן עניינים

1. [יצירת פרויקט Supabase](#1-יצירת-פרויקט-supabase)
2. [הרצת ה-SQL](#2-הרצת-ה-sql)
3. [הגדרת PIN-ים ו-SESSION_SECRET](#3-הגדרת-pin-ים-ו-session_secret)
4. [התקנה מקומית](#4-התקנה-מקומית)
5. [בדיקות](#5-בדיקות)
6. [Build](#6-build)
7. [העלאה ל-GitHub](#7-העלאה-ל-github)
8. [פריסה ב-Vercel](#8-פריסה-ב-vercel)
9. [מבנה הפרויקט](#9-מבנה-הפרויקט)
10. [כללי השכר והאלגוריתם](#10-כללי-השכר-והאלגוריתם)
11. [אבטחה](#11-אבטחה)

---

## 1. יצירת פרויקט Supabase

1. היכנסי ל-[supabase.com](https://supabase.com) וצרי חשבון/התחברי.
2. לחצי **New project**, בחרי ארגון, תני שם לפרויקט (למשל `shift-scheduler`),
   בחרי סיסמת מסד נתונים (שמרי אותה בצד) ואזור קרוב (למשל `eu-central-1`).
3. המתיני לסיום ההקמה (כ-2 דקות).
4. בתפריט השמאלי: **Project Settings → API**.
   - **Project URL** → זה ה-`NEXT_PUBLIC_SUPABASE_URL`.
   - **service_role key** (תחת "Project API keys", **לא** ה-`anon` key!) →
     זה ה-`SUPABASE_SERVICE_ROLE_KEY`. שמרי אותו בסוד — לעולם אל תחשפי אותו
     בקוד Client, ב-Git, או בכל מקום ציבורי.

## 2. הרצת ה-SQL

1. בתפריט השמאלי של Supabase: **SQL Editor → New query**.
2. פתחי את הקובץ `supabase/migrations/0001_init.sql` מהפרויקט, העתיקי את
   כל התוכן, הדביקי בעורך ה-SQL ולחצי **Run**.
3. פתחי query חדש, העתיקי את `supabase/migrations/0002_atomic_operations.sql`
   והריצי גם אותו. הוא מוסיף פונקציית Postgres (`replace_week_assignments`)
   שמבצעת את מחיקת/יצירת השיבוץ כפעולה אטומית אחת (טרנזקציה), כך שכשל
   באמצע לא משאיר את השבוע בלי שיבוץ בכלל.
4. הריצי לפי הסדר גם את `0003_preference_confirmations.sql`, את
   `0004_shift_settings.sql`, את `0005_algorithm_priority.sql` ואת
   `0006_balance_week_override.sql`. המיגרציה השישית מוסיפה אפשרות
   לכבות ולהפעיל מחדש שבוע מאזן עבור שבוע מסוים, בלי לשנות את ברירת
   המחדל של שבועות קיימים.
5. (אופציונלי) לנתוני דוגמה: פתחי את `supabase/seed.sql`, עדכני את התאריך
   `week_start` לתאריך יום ראשון עתידי אמיתי (פורמט `YYYY-MM-DD`), הדביקי
   בעורך SQL חדש והריצי.

זה יוצר את הטבלאות `weeks`, `preferences`, `assignments` עם כל ה-constraints,
ה-unique indexes, וה-Row Level Security (מופעל, ללא policies — כל הגישה
דרך ה-service role key בצד השרת בלבד, שעוקף RLS מטבעו).

## 3. הגדרת PIN-ים ו-SESSION_SECRET

1. העתיקי את `.env.example` לקובץ בשם `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. מלאי את הערכים:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJ...   # מ-Project Settings → API
   HILA_PIN=384726     # 6 ספרות לפחות
   YAARA_PIN=592013    # 6 ספרות לפחות
   OMER_PIN=671459     # 6 ספרות לפחות
   ADMIN_PIN=48213967  # 8 ספרות לפחות (מומלץ ארוך יותר מהעובדות)
   SESSION_SECRET=...  # מחרוזת אקראית ארוכה, לפחות 32 תווים
   APP_TIME_ZONE=Asia/Jerusalem  # קובע איזה יום נחשב "היום"/"השבוע הנוכחי"
   ```
   **מדיניות PIN:** הקוד חייב להיות ספרות בלבד; לעובדות נדרשות 6+ ספרות,
   למנהל 8+ ספרות. קוד קצר מדי יידחה גם אם יוזן נכון (הבדיקה מתבצעת הן
   בוולידציה של הבקשה והן כבדיקת-הגנה נוספת בזמן ההתחברות עצמה).

   ליצירת `SESSION_SECRET` אקראי:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
3. **חשוב:** `.env.local` לא נכנס ל-Git (הוא כבר ב-`.gitignore`). ב-Vercel
   מגדירים את אותם משתנים דרך ממשק הפרויקט (ראי סעיף 8).

## 4. התקנה מקומית

דרישות: Node.js 20 ומעלה, npm.

```bash
npm install
npm run dev
```

האתר יעלה בכתובת [http://localhost:3000](http://localhost:3000).
בחרי משתמש (הילה / יערה / עומר / מנהל) והזיני את ה-PIN שהגדרת.

## 5. בדיקות

הרצת בדיקות היחידה לאלגוריתם השיבוץ (Vitest):

```bash
npm test
```

הבדיקות מכסות: איסור שיבוץ ל"לא יכולה", מספר משמרות באותו יום לאותה עובדת,
חישוב נכון של ימי פרמיה, מזעור פער גלובלי (לא לפי יום), מקרה שוויון מלא
(8.00/8.00/8.00), ותוצאה דטרמיניסטית.

## 6. Build

```bash
npm run build
```

בודקת טעינת TypeScript מלאה ובניית production build. אם יש שגיאות סביבה
(משתני env חסרים), ודאי ש-`.env.local` מוגדר כראוי לפני ההרצה.

## 7. העלאה ל-GitHub

```bash
git init
git add .
git commit -m "Initial commit: weekly shift scheduler"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

ודאי ש-`.env.local` **לא** נכלל ב-commit (הוא כבר ב-`.gitignore`).

## 8. פריסה ב-Vercel

1. היכנסי ל-[vercel.com](https://vercel.com) והתחברי עם GitHub.
2. **Add New → Project**, בחרי את ה-repository שיצרת.
3. Framework Preset: Next.js (מזוהה אוטומטית).
4. לפני הדיפלוי, לחצי **Environment Variables** והוסיפי את כל המשתנים מ-
   `.env.local` (עבור Production, Preview ו-Development):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `HILA_PIN`, `YAARA_PIN`, `OMER_PIN`, `ADMIN_PIN`
   - `SESSION_SECRET`
5. לחצי **Deploy**. בסיום תקבלי כתובת ציבורית (`your-project.vercel.app`).
6. כל push ל-`main` יפרוס גרסה חדשה אוטומטית.

## 9. מבנה הפרויקט

```
weekly-shift-scheduler/
├── middleware.ts                 # הגנת נתיבים + אימות session
├── .eslintrc.json                # קונפיגורציית ESLint (next/core-web-vitals)
├── supabase/
│   ├── migrations/
│   │   ├── 0001_init.sql         # סכמת מסד הנתונים המלאה
│   │   ├── 0002_atomic_operations.sql  # פונקציית Postgres אטומית לשיבוץ
│   │   ├── 0004_shift_settings.sql      # מבנה משמרות דינמי
│   │   ├── 0005_algorithm_priority.sql  # תעדוף אלגוריתם פר-שבוע
│   │   └── 0006_balance_week_override.sql # הפעלת שבוע מאזן פר-שבוע
│   └── seed.sql                  # נתוני דוגמה
├── src/
│   ├── app/
│   │   ├── page.tsx              # מסך התחברות (בחירת משתמש + PIN)
│   │   ├── layout.tsx            # RTL root layout
│   │   ├── week/[weekStart]/     # מסך עובדת
│   │   ├── admin/[weekStart]/    # מסך מנהל
│   │   └── api/                  # כל ה-API routes (server-side בלבד)
│   ├── components/
│   │   └── ConfirmModal.tsx      # מודל אישור מותאם (לא window.confirm)
│   ├── lib/
│   │   ├── scheduler.ts          # אלגוריתם ה-DP המדויק
│   │   ├── weekSlots.ts          # בניית 21 המשמרות לשבוע
│   │   ├── payUnits.ts           # חישוב יחידות שכר (0.125)
│   │   ├── completeness.ts       # זיהוי העדפות/שיבוצים חסרים
│   │   ├── statusGuards.ts       # אכיפת מעברי סטטוס משותפת לכל ה-API
│   │   ├── rateLimit.ts          # rate limiting בסיסי להתחברות
│   │   ├── dbCore.ts             # לוגיקת ה-DB הטהורה (ללא server-only) - נבדקת ישירות
│   │   ├── db.ts                 # שכבת גישה ל-Supabase, עוטפת את dbCore.ts
│   │   ├── session.ts            # signed HTTP-only cookie + בדיקות תוקף
│   │   ├── auth.ts               # אימות PIN + session
│   │   ├── supabaseServer.ts     # קליינט Supabase (service role, server-only)
│   │   └── zodSchemas.ts         # ולידציה לכל ה-API
│   └── tests/                    # בדיקות Vitest
│       ├── scheduler.test.ts
│       ├── completeness.test.ts
│       ├── statusGuards.test.ts
│       ├── session.test.ts
│       ├── dates.test.ts
│       ├── weekResolver.test.ts
│       └── replaceAssignmentsAtomic.test.ts
├── .env.example
└── package.json
```

## 10. כללי השכר והאלגוריתם

יחידות שכר (סקאלה של 0.125 למניעת floating point):

| משמרת    | רגיל | פרמיה (x1.5) |
|----------|------|--------------|
| בוקר     | 10   | 15           |
| צהריים   | 4    | 6            |
| ערב      | 10   | 15           |

חלקי ב-8 (או הכפילי ב-0.125) כדי לקבל את הערך האמיתי (למשל 10 → 1.25).

האלגוריתם (`src/lib/scheduler.ts`) בונה מצב DP על סכום המשכורות המצטבר של
הילה ויערה בלבד (עומר נגזר מהסכום הכולל הקבוע, שכן כל 21 המשמרות תמיד
משובצות למישהי). האופטימיזציה מתבצעת ב-3 שלבים:

1. **Reachability קדימה** — אילו מצבי סיום אפשריים בכלל, בכפוף ל"לא יכולה".
2. **בחירת הפער המינימלי הגלובלי** בין המצבים האפשריים, ואז **reachability
   אחורה** לזיהוי אילו מצבים בכל צעד עדיין יכולים להוביל לפער האופטימלי.
3. **DP קדימה עם עלות** בתוך המצבים התקפים בלבד — ממזער את מספר ה"מעדיפה
   שלא", ואז ממקסם את ציון ההעדפות. שוויון נשבר לפי שונות מינימלית, ולבסוף
   לפי סדר איטרציה קבוע — כך שאותה קלט תמיד מייצר תוצאה זהה.

## 11. אבטחה

- ה-PIN-ים וה-`SESSION_SECRET` נשמרים אך ורק במשתני סביבה בצד השרת. הקוד
  דורש מינימום 6 ספרות לעובדות ו-8 לספרות מנהל (גם בוולידציה וגם כבדיקת
  הגנה נוספת מול הערך שהוגדר בפועל ב-env).
- ה-session cookie הוא HTTP-only, חתום ב-HMAC-SHA256, עם בדיקת role חוקי
  ובדיקת גיל (iat) שלא עולה על 30 יום — גם אם עוגייה ישנה "נגנבת" ומוזרקת
  מחדש, השרת ידחה אותה. הדגל `secure` מופעל אוטומטית רק כש-`NODE_ENV`
  הוא production (כדי לא לשבור פיתוח מקומי מעל http://).
- Rate limiting בסיסי על ההתחברות (עד 8 ניסיונות ב-5 דקות לכל IP), ממומש
  כ-Map בזיכרון התהליך. **מגבלה חשובה:** בסביבת serverless (Vercel) ה-Map
  הזה חי רק כל עוד המופע "חם" ואינו משותף בין מופעים מקבילים — זו הגנה
  משמעותית מול ניחוש חוזר ונשנה ממקור בודד, אך לא הגנה הרמטית מול מתקפה
  מבוזרת. להגנה חזקה יותר וחוצת-מופעים, מומלץ להחליף בעתיד ב-store משותף
  כמו Upstash Redis (מתאים היטב ל-Vercel).
- `SUPABASE_SERVICE_ROLE_KEY` נטען רק בקבצים המסומנים `import "server-only"`
  ולעולם לא נשלח לדפדפן; כנ"ל לגבי כל ה-PIN-ים.
- Middleware חוסם גישה לכל נתיבי `/week`, `/admin` וה-API התואמים ללא session
  תקף; נתיבי `/admin/*` דורשים role admin.
- כל endpoint מבצע ולידציה מלאה עם Zod (כולל `weekStartSchema` שמוודאת
  תאריך אמיתי שחל ביום ראשון, לא רק תבנית regex), ואוכף בשרת — לא רק
  בממשק — את מצב השבוע המתאים לכל פעולה (ראי טבלה בסעיף הבא) ואת זהות
  העובדת עבור עריכת העדפות עצמיות. המנהל יכול לערוך העדפות של כל עובדת,
  וגם זה נאכף בשרת (לא רק מוסתר/מוצג בממשק).

### אכיפת מצב שבוע (בשרת, לא רק בממשק)

| פעולה | מותר במצב |
|---|---|
| עריכת העדפות (עובדת או מנהל) | `open` בלבד |
| שינוי ימי פרמיה | `open` / `draft` (לא `published`) |
| יצירת/יצירה-מחדש של שיבוץ | `open` / `draft`, **וגם** רק כששלוש העובדות השלימו את כל 21 המשמרות |
| עריכה ידנית של שיבוץ | `draft` בלבד |
| פרסום שיבוץ | `draft` בלבד, **וגם** רק כשכל 21 המשמרות משובצות |
| פתיחה מחדש (`reopen`) | `draft → open`, `published → draft`, `published → open` בלבד. `open → draft` וכל מעבר למצב זהה חסומים. |

כשיוצרים שיבוץ (auto-generate) בזמן שכבר קיימות הקצאות לשבוע (מכל סוג —
לא רק ידניות), הממשק מציג מודל אישור מותאם (לא `window.confirm`) שמסביר
שהשיבוץ הקיים יוחלף, לפני שליחת הבקשה בפועל.

## 12. שלמות נתונים (Race conditions וטרנזקציות)

- **`getOrCreateWeek`** משתמש ב-`INSERT ... ON CONFLICT (week_start) DO
  NOTHING` (פעולה אטומית ברמת Postgres) ולא ב-select-ואז-insert נפרדים,
  כך שכמה בקשות שמגיעות בו-זמנית (למשל כמה עובדות שפותחות את אותו שבוע
  חדש יחד) תמיד מתכנסות לאותה שורה יחידה, בלי שגיאת "duplicate key".
- **`replaceAssignments`** (המשמש ביצירת שיבוץ) קורא לפונקציית Postgres
  אטומית `replace_week_assignments` (מיגרציה `0002`) שמבצעת את המחיקה
  וההכנסה מחדש כטרנזקציה אחת. אם ההכנסה נכשלת מכל סיבה, המחיקה שקדמה לה
  *באותה קריאה* מתבטלת גם היא — השבוע לעולם לא נשאר בלי שיבוץ בכלל בגלל
  כשל חלקי.

## 13. אימות (QA)

הפרויקט נכתב ותוקן בסביבת ארגז חול ללא גישה לרשת, ולכן **לא ניתן היה
להריץ בפועל `npm install` / `npm test` / `npm run build` בתוך אותה סביבה**
— אין דרך להוריד את החבילות מ-npm registry ממנה. כדי לוודא את נכונות
הלוגיקה בכל זאת, כל הקבצים ה"טהורים" (ללא תלות ב-Next.js/Supabase בזמן
ריצה) — האלגוריתם, בדיקות השלמות, guard-ים של סטטוס, session, תאריכים,
ה-race-condition-safety של `getOrCreateWeek`, והאטומיות של
`replaceAssignments` — נבדקו בנפרד באמצעות קומפילציה ישירה ל-JavaScript
(`tsc`) והרצה תחת Node.js הגלובלי הזמין בארגז החול, ללא צורך ב-npm
install. כל הבדיקות הללו עברו בהצלחה.

**זה אינו תחליף להרצת `npm install && npm test && npm run build` האמיתיים
אצלך**, שבודקים גם את השכבות שתלויות ב-Next.js, React ו-Supabase JS (דפים,
API routes, middleware) שלא ניתן לבדוק בלי אותן חבילות מותקנות. מומלץ
להריץ את שלוש הפקודות אצלך אחרי `git clone`/פתיחת ה-ZIP, ואם תתקל בשגיאה —
לשלוח לי אותה ואתקן.
