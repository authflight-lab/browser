/**
 * bartender-render — Cloudflare Browser Rendering Worker
 *
 * POST /render
 *   Body (JSON):
 *     html      string   Full self-contained HTML. {{FONT_FACES}} is replaced
 *                        with bundled Inter font-face declarations server-side.
 *     selector  string?  CSS selector to screenshot (default: ".card")
 *     waitFor   string?  JS expression to wait for (default: "window.__chartDone === true")
 *     quality   number?  JPEG quality 1-100 (default: 92)
 *     width     number?  Viewport width  px (default: 2400)
 *     height    number?  Viewport height px (default: 1600)
 *
 *   Response: image/jpeg bytes on success, plain-text error on failure.
 *
 * Auth: if RENDER_SECRET env var is set, every request must carry a matching
 *       X-Render-Secret header — otherwise 401.
 *
 * All other paths return 404.
 */

import puppeteer from "@cloudflare/puppeteer";
import { fontFacesCSS } from "./fonts";

export interface Env {
  MYBROWSER: any;
  RENDER_SECRET?: string;
}

interface RenderRequest {
  html: string;
  selector?: string;
  waitFor?: string;
  quality?: number;
  width?: number;
  height?: number;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // ── route guard ──────────────────────────────────────────────────────────
    if (request.method !== "POST" || url.pathname !== "/render") {
      return new Response("Not Found", { status: 404 });
    }

    // ── auth ─────────────────────────────────────────────────────────────────
    if (env.RENDER_SECRET) {
      const provided = request.headers.get("X-Render-Secret") ?? "";
      if (provided !== env.RENDER_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    // ── parse body ───────────────────────────────────────────────────────────
    let body: RenderRequest;
    try {
      body = (await request.json()) as RenderRequest;
    } catch {
      return new Response("Bad Request: invalid JSON", { status: 400 });
    }

    const {
      html,
      selector = ".card",
      waitFor = "window.__chartDone === true",
      quality = 92,
      width = 1200,
      height = 900,
    } = body;

    if (!html || typeof html !== "string") {
      return new Response("Bad Request: html is required", { status: 400 });
    }

    // ── font injection ───────────────────────────────────────────────────────
    // The bot sends HTML with {{FONT_FACES}} still as a placeholder; we replace
    // it here with bundled Inter base64 font-face declarations so the Worker
    // is the only place fonts live — bot payloads stay small.
    const fullHtml = html.replace("{{FONT_FACES}}", fontFacesCSS);

    // ── render ───────────────────────────────────────────────────────────────
    let browser: any;
    try {
      browser = await puppeteer.launch(env.MYBROWSER);
      const page = await browser.newPage();

      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await page.setContent(fullHtml, { waitUntil: "domcontentloaded" });

      if (waitFor) {
        try {
          await page.waitForFunction(waitFor, { timeout: 8000, polling: 50 });
        } catch {
          // Chart/animation timeout is non-fatal; render whatever painted.
        }
      }

      const el = await page.$(selector);
      const screenshot = el
        ? await el.screenshot({ type: "jpeg", quality })
        : await page.screenshot({ type: "jpeg", quality });

      return new Response(screenshot, {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return new Response(`Render error: ${msg}`, { status: 500 });
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch {
          // best-effort
        }
      }
    }
  },
};
