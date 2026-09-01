import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  IOS_INSTALL_STEPS,
  IosInstallInstructions,
} from "../components/PwaInstall";

describe("iOS install instructions", () => {
  it("renders the voluntary Share to Home Screen flow", () => {
    const markup = renderToStaticMarkup(
      createElement(IosInstallInstructions, {
        onClose: () => undefined,
      })
    );

    expect(IOS_INSTALL_STEPS).toHaveLength(3);
    expect(markup).toContain("Share");
    expect(markup).toContain("Add to Home Screen");
    expect(markup).toContain("Add");
    expect(markup).toContain("בלי App Store");
    expect(markup).toContain("Safari");
    expect(markup).toContain("aria-modal=\"true\"");
  });
});
