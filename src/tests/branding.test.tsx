import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AppBrand from "../components/AppBrand";
import {
  APP_DISPLAY_NAME,
  APP_LOGO_PATH,
  APP_NAME,
} from "../lib/branding";

describe("app branding", () => {
  it("renders the shared PWA name and current PWA icon", () => {
    const markup = renderToStaticMarkup(createElement(AppBrand));

    expect(markup).toContain(`לוגו ${APP_NAME}`);
    expect(markup).toContain(APP_DISPLAY_NAME);
    expect(markup).toContain(encodeURIComponent(APP_LOGO_PATH));
  });
});
