import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ChangelogModal from "../components/ChangelogModal";
import EmployeeHeader from "../components/EmployeeHeader";
import { CHANGELOG_ENTRIES } from "../lib/changelog";
import { APP_LOGO_PATH } from "../lib/branding";

describe("employee header", () => {
  it("keeps the logo, greeting and compact changelog action beside logout", () => {
    const markup = renderToStaticMarkup(
      createElement(EmployeeHeader, {
        employeeName: "הילה",
        onOpenChangelog: vi.fn(),
        onLogout: vi.fn(),
      })
    );

    expect(markup).toContain("שלום הילה");
    expect(markup).toContain("מה חדש?");
    expect(markup).toContain("התנתקות");
    expect(markup).toContain(encodeURIComponent(APP_LOGO_PATH));
    expect(markup).toContain("text-xs sm:text-sm");
  });

  it("does not render the obsolete completion bar on the employee screen", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/app/week/[weekStart]/EmployeeWeekClient.tsx"
      ),
      "utf8"
    );

    expect(source).not.toContain("CompletionBar");
    expect(source).not.toContain("הושלמו");
  });
});

describe("employee changelog", () => {
  it("keeps the newest release first and excludes the initial-version entry", () => {
    expect(CHANGELOG_ENTRIES[0].date).toBe("01.09.2026");
    expect(JSON.stringify(CHANGELOG_ENTRIES)).not.toContain("גרסה ראשונה");

    const markup = renderToStaticMarkup(
      createElement(ChangelogModal, {
        open: true,
        onClose: vi.fn(),
      })
    );

    expect(markup.indexOf("01.09.2026")).toBeLessThan(
      markup.indexOf("29.08.2026")
    );
  });

  it("renders a responsive internally scrollable dialog with both close controls", () => {
    const markup = renderToStaticMarkup(
      createElement(ChangelogModal, {
        open: true,
        onClose: vi.fn(),
      })
    );

    expect(markup).toContain("מה חדש ב-UpRiver?");
    expect(markup).toContain("aria-modal=\"true\"");
    expect(markup).toContain("overflow-y-auto");
    expect(markup).toContain("max-h-[78dvh]");
    expect(markup).toContain("max-w-md");
    expect(markup).toContain("sm:items-center");
    expect(markup).toContain("aria-label=\"סגירת מה חדש\"");
    expect(markup).toContain(">סגור</button>");
  });

  it("renders nothing after the modal is closed", () => {
    const markup = renderToStaticMarkup(
      createElement(ChangelogModal, {
        open: false,
        onClose: vi.fn(),
      })
    );

    expect(markup).toBe("");
  });
});
