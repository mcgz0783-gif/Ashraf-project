// agent/vercel.ts — Vercel tool implementations
const VERCEL_TOKEN = process.env.VERCEL_TOKEN!;
const BASE = "https://api.vercel.com";

const headers = {
  Authorization: `Bearer ${VERCEL_TOKEN}`,
  "Content-Type": "application/json",
};

// ── List deployments ──────────────────────────────────────────
export async function vercel_list_deployments({ project_id, limit = 10 }: {
  project_id: string; limit?: number;
}) {
  const res = await fetch(`${BASE}/v6/deployments?projectId=${project_id}&limit=${limit}`, { headers });
  const data = await res.json();
  return data.deployments.map((d: any) => ({
    id: d.uid,
    url: d.url,
    state: d.state,          // READY | ERROR | BUILDING | CANCELED
    created: new Date(d.createdAt).toISOString(),
    branch: d.meta?.githubCommitRef,
    commit: d.meta?.githubCommitSha?.slice(0, 7),
    message: d.meta?.githubCommitMessage,
  }));
}

// ── Get deployment logs ────────────────────────────────────────
export async function vercel_get_deployment_logs({ deployment_id }: {
  deployment_id: string;
}) {
  const res = await fetch(`${BASE}/v2/deployments/${deployment_id}/events`, { headers });
  const data = await res.json();
  // Return last 50 log lines
  return (data as any[]).slice(-50).map((e: any) => ({
    type: e.type,
    created: new Date(e.created).toISOString(),
    text: e.payload?.text || e.payload?.info?.message || JSON.stringify(e.payload),
  }));
}

// ── Rollback deployment ───────────────────────────────────────
export async function vercel_rollback_deployment({ project_id, deployment_id }: {
  project_id: string; deployment_id: string;
}) {
  const res = await fetch(`${BASE}/v9/projects/${project_id}/rollback/${deployment_id}`, {
    method: "POST", headers,
  });
  if (!res.ok) throw new Error(`Rollback failed: ${res.statusText}`);
  const data = await res.json();
  return { status: "rolling_back", jobStatus: data.jobStatus };
}
