// server.ts — Express server with SSE streaming + Vercel webhook support
import express from "express";
import cors from "cors";
import crypto from "crypto";
import { runAgent } from "./agent";
import type { Content } from "@google/generative-ai";

const app = express();
app.use(cors());

// ── Raw body parser for webhook signature verification ─────────
// Must come BEFORE express.json() so we can access rawBody on /webhook
app.use((req, _res, next) => {
  if (req.path === "/webhook/vercel") {
    let raw = "";
    req.on("data", chunk => (raw += chunk));
    req.on("end", () => {
      (req as any).rawBody = raw;
      try { (req as any).body = JSON.parse(raw); } catch { (req as any).body = {}; }
      next();
    });
  } else {
    express.json()(req, _res, next);
  }
});

// In-memory session histories (use Redis for production)
const sessions = new Map<string, Content[]>();

// In-memory incident log — stores auto-fix attempts from webhooks
const incidentLog: {
  id: string;
  deploymentId: string;
  project: string;
  branch: string;
  triggeredAt: string;
  status: "running" | "fixed" | "failed";
  modelUsed?: string;
  agentReply?: string;
  error?: string;
}[] = [];

// ── Webhook signature verification ────────────────────────────
function verifyVercelSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.VERCEL_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("[webhook] VERCEL_WEBHOOK_SECRET not set — skipping signature check");
    return true;
  }
  const expected = crypto
    .createHmac("sha1", secret)
    .update(rawBody)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// ── Auto-fix prompt builder ────────────────────────────────────
function buildAutoFixPrompt(event: any): string {
  const { deployment, project } = event;
  return `
A Vercel deployment just FAILED. Investigate and auto-fix it.

Project:      ${project?.name ?? deployment?.meta?.githubRepoName ?? "unknown"}
Deployment ID: ${deployment?.id}
Branch:        ${deployment?.meta?.githubCommitRef ?? "unknown"}
Commit:        ${deployment?.meta?.githubCommitSha?.slice(0, 7) ?? "unknown"}
Commit msg:    ${deployment?.meta?.githubCommitMessage ?? "unknown"}
GitHub owner:  ${deployment?.meta?.githubCommitAuthorLogin ?? "unknown"}
GitHub repo:   ${deployment?.meta?.githubRepoName ?? "unknown"}

Steps to follow:
1. Fetch the deployment logs using vercel_get_deployment_logs
2. Identify the root cause of the failure
3. Read the relevant source file(s) from GitHub
4. Create a fix branch named fix/vercel-${deployment?.id?.slice(-6) ?? "error"}
5. Apply the fix and write the file(s)
6. Open a PR with a clear description of what went wrong and how it was fixed

Be thorough. The goal is a merged PR that unblocks the deployment.
`.trim();
}

// ── POST /webhook/vercel ───────────────────────────────────────
app.post("/webhook/vercel", async (req, res) => {
  const signature = req.headers["x-vercel-signature"] as string;
  const rawBody = (req as any).rawBody ?? "";

  if (signature && !verifyVercelSignature(rawBody, signature)) {
    console.error("[webhook] Invalid signature — request rejected");
    return res.status(401).json({ error: "Invalid signature" });
  }

  const event = (req as any).body;
  const eventType: string = event?.type ?? "";

  // Only care about deployment failures
  if (eventType !== "deployment.error") {
    return res.status(200).json({ ignored: true, type: eventType });
  }

  const deploymentId: string = event?.deployment?.id ?? "unknown";
  const project: string =
    event?.project?.name ?? event?.deployment?.meta?.githubRepoName ?? "unknown";
  const branch: string =
    event?.deployment?.meta?.githubCommitRef ?? "unknown";

  console.log(`[webhook] 🚨 deployment.error — ${project} / ${branch} (${deploymentId})`);

  // Acknowledge immediately — Vercel expects a fast 2xx
  res.status(200).json({ received: true, deploymentId });

  // Create an incident record
  const incidentId = crypto.randomUUID();
  const incident = {
    id: incidentId,
    deploymentId,
    project,
    branch,
    triggeredAt: new Date().toISOString(),
    status: "running" as const,
  };
  incidentLog.unshift(incident);

  // Run the agent asynchronously
  (async () => {
    try {
      const prompt = buildAutoFixPrompt(event);
      console.log(`[webhook] 🤖 Starting auto-fix agent for incident ${incidentId}`);
      const { reply, modelUsed } = await runAgent(prompt);

      Object.assign(incident, { status: "fixed", agentReply: reply, modelUsed });
      console.log(`[webhook] ✅ Auto-fix complete for ${incidentId} (${modelUsed})`);
    } catch (err: any) {
      Object.assign(incident, { status: "failed", error: err.message });
      console.error(`[webhook] ❌ Auto-fix failed for ${incidentId}:`, err.message);
    }
  })();
});

// ── GET /incidents — view webhook-triggered auto-fix log ───────
app.get("/incidents", (_req, res) => {
  res.json({ incidents: incidentLog.slice(0, 50) });
});

// ── POST /chat  (non-streaming) ────────────────────────────────
app.post("/chat", async (req, res) => {
  const { message, session_id = "default" } = req.body;
  if (!message) return res.status(400).json({ error: "message required" });

  const history = sessions.get(session_id) || [];
  const { reply, history: updatedHistory, modelUsed } = await runAgent(message, history);

  sessions.set(session_id, updatedHistory.slice(-40));
  res.json({ reply, modelUsed });
});

// ── GET /chat/stream  (Server-Sent Events) ────────────────────
app.get("/chat/stream", async (req, res) => {
  const { message, session_id = "default" } = req.query as Record<string, string>;
  if (!message) return res.status(400).end();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const history = sessions.get(session_id) || [];

  const { history: updatedHistory, modelUsed } = await runAgent(message, history, (token) => {
    res.write(`data: ${JSON.stringify({ token })}\n\n`);
  });

  sessions.set(session_id, updatedHistory.slice(-40));
  res.write(`data: ${JSON.stringify({ modelUsed })}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
});

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => {
  console.log(`🤖 Agent server (Gemini) running on port ${PORT}`);
  console.log("🔔 Vercel webhook endpoint: POST /webhook/vercel");
  console.log("📋 Incident log:            GET  /incidents");
});
