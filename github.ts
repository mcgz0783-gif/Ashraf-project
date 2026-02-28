// agent/github.ts — GitHub tool implementations
import { Octokit } from "@octokit/rest";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// ── Read a file ────────────────────────────────────────────────
export async function github_read_file({ owner, repo, path, branch = "main" }: {
  owner: string; repo: string; path: string; branch?: string;
}) {
  const { data } = await octokit.repos.getContent({ owner, repo, path, ref: branch });
  if ("content" in data) {
    return {
      path: data.path,
      sha: data.sha,
      content: Buffer.from(data.content, "base64").toString("utf-8"),
    };
  }
  throw new Error("Not a file");
}

// ── List recent commits ────────────────────────────────────────
export async function github_list_commits({ owner, repo, branch = "main", limit = 10 }: {
  owner: string; repo: string; branch?: string; limit?: number;
}) {
  const { data } = await octokit.repos.listCommits({
    owner, repo, sha: branch, per_page: limit,
  });
  return data.map(c => ({
    sha: c.sha.slice(0, 7),
    message: c.commit.message.split("\n")[0],
    author: c.commit.author?.name,
    date: c.commit.author?.date,
  }));
}

// ── Create branch ─────────────────────────────────────────────
export async function github_create_branch({ owner, repo, branch_name, from_branch = "main" }: {
  owner: string; repo: string; branch_name: string; from_branch?: string;
}) {
  const { data: ref } = await octokit.git.getRef({
    owner, repo, ref: `heads/${from_branch}`,
  });
  await octokit.git.createRef({
    owner, repo,
    ref: `refs/heads/${branch_name}`,
    sha: ref.object.sha,
  });
  return { branch: branch_name, sha: ref.object.sha };
}

// ── Write a file ──────────────────────────────────────────────
export async function github_write_file({ owner, repo, path, content, message, branch }: {
  owner: string; repo: string; path: string;
  content: string; message: string; branch: string;
}) {
  // Get current SHA if file exists
  let sha: string | undefined;
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path, ref: branch });
    if ("sha" in data) sha = data.sha;
  } catch {}

  const { data } = await octokit.repos.createOrUpdateFileContents({
    owner, repo, path, message, branch, sha,
    content: Buffer.from(content).toString("base64"),
  });
  return { commit: data.commit.sha?.slice(0, 7), path };
}

// ── Open a PR ─────────────────────────────────────────────────
export async function github_open_pr({ owner, repo, title, body, head, base = "main" }: {
  owner: string; repo: string; title: string;
  body: string; head: string; base?: string;
}) {
  const { data } = await octokit.pulls.create({ owner, repo, title, body, head, base });
  return { number: data.number, url: data.html_url, state: data.state };
}
