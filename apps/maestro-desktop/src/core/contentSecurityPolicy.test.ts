import {describe, expect, it} from "vitest";

import maestroHtml from "../../index.html?raw";

describe("Content Security Policy de Maestro", () => {
  it("permite solo los endpoints locales y de staging requeridos", () => {
    const csp = maestroHtml.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/u)?.[1];
    const connectSrc = csp
      ?.split(";")
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith("connect-src "));
    const sources = connectSrc?.split(/\s+/u).slice(1) ?? [];

    expect(sources).toEqual(expect.arrayContaining([
      "'self'",
      "http://127.0.0.1:5173",
      "ws://127.0.0.1:5173",
      "http://127.0.0.1:9099",
      "http://127.0.0.1:8180",
      "ws://127.0.0.1:8180",
      "https://identitytoolkit.googleapis.com",
      "https://securetoken.googleapis.com",
      "https://firestore.googleapis.com",
      "https://us-central1-viverocontrol-3f83f.cloudfunctions.net",
    ]));
    expect(sources).not.toContain("*");
    expect(sources).not.toContain("https:");
    expect(sources).not.toContain("http:");
    expect(sources.some((source) => source.includes("*"))).toBe(false);
    expect(csp).not.toContain("'unsafe-eval'");
  });
});
