import { serve } from "bun";
import { existsSync, statSync, readFileSync } from "fs";
import { join } from "path";

const PORT = parseInt(process.env.ARTIFACT_PORT || "8080", 10);
const ROOT = process.env.ARTIFACT_ROOT || `${process.env.HOME}/opt/loc-artifacts`;

const MIME_TYPES: Record<string, string> = {
  ".txt": "text/plain; charset=utf-8",
  ".gz":  "application/gzip",
  ".tar": "application/x-tar",
  ".yaml": "text/plain; charset=utf-8",
  ".sh":  "text/plain; charset=utf-8",
  ".json": "application/json",
};

serve({
  port: PORT,
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const filePath = join(ROOT, url.pathname);

    if (!filePath.startsWith(ROOT)) {
      return new Response("Forbidden", { status: 403 });
    }

    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      return new Response("Not Found", { status: 404 });
    }

    const ext = filePath.slice(filePath.lastIndexOf("."));
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    const file = Bun.file(filePath);
    return new Response(file, {
      headers: { "Content-Type": contentType },
    });
  },
});

console.log(`[artifacts] serving ${ROOT} on :${PORT}`);
