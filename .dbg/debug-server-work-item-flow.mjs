import { createServer } from "node:http";
import { mkdirSync, appendFileSync, writeFileSync, existsSync, unlinkSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const outdir = resolve(".dbg");
const sessionId = "work-item-flow";
const port = 7777;
mkdirSync(outdir, { recursive: true });
const logFile = join(outdir, `trae-debug-log-${sessionId}.ndjson`);
if (existsSync(logFile)) unlinkSync(logFile);
writeFileSync(join(outdir, `${sessionId}.env`), `DEBUG_SERVER_URL=http://127.0.0.1:${port}/event\nDEBUG_SESSION_ID=${sessionId}\n`);
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
const server = createServer((req, res) => {
  Object.entries(cors).forEach(([key, value]) => res.setHeader(key, value));
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  if (req.method === "POST" && req.url === "/event") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => { try { const event = JSON.parse(body); event.ts ??= Date.now(); appendFileSync(logFile, `${JSON.stringify(event)}\n`); res.writeHead(200); res.end("ok"); } catch { res.writeHead(400); res.end("invalid json"); } });
    return;
  }
  if (req.method === "GET" && req.url?.startsWith("/logs")) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(existsSync(logFile) ? readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : [])); return; }
  res.writeHead(404); res.end();
});
server.listen(port, "127.0.0.1", () => process.stdout.write(`@@DEBUG_SERVER_INFO\n${JSON.stringify({ api_url: `http://127.0.0.1:${port}/event`, session_id: sessionId, log_file: logFile })}\n@@END_DEBUG_SERVER_INFO\n`));
