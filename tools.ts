// agent/tools.ts — Tool definitions in Google Gemini FunctionDeclaration format
import { SchemaType, type FunctionDeclaration } from "@google/generative-ai";

export const GEMINI_TOOLS: FunctionDeclaration[] = [
  // ── GITHUB TOOLS ──────────────────────────────────────────────
  {
    name: "github_read_file",
    description: "Read a file from a GitHub repository",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        owner:  { type: SchemaType.STRING, description: "Repo owner (user or org)" },
        repo:   { type: SchemaType.STRING, description: "Repository name" },
        path:   { type: SchemaType.STRING, description: "File path in repo" },
        branch: { type: SchemaType.STRING, description: "Branch name (default: main)" },
      },
      required: ["owner", "repo", "path"],
    },
  },
  {
    name: "github_list_commits",
    description: "List recent commits on a branch",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        owner:  { type: SchemaType.STRING },
        repo:   { type: SchemaType.STRING },
        branch: { type: SchemaType.STRING, description: "Branch name (default: main)" },
        limit:  { type: SchemaType.NUMBER, description: "Max commits to return (default 10)" },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "github_create_branch",
    description: "Create a new branch from a base branch",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        owner:       { type: SchemaType.STRING },
        repo:        { type: SchemaType.STRING },
        branch_name: { type: SchemaType.STRING, description: "New branch name" },
        from_branch: { type: SchemaType.STRING, description: "Base branch (default: main)" },
      },
      required: ["owner", "repo", "branch_name"],
    },
  },
  {
    name: "github_write_file",
    description: "Write or update a file in a GitHub repository",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        owner:   { type: SchemaType.STRING },
        repo:    { type: SchemaType.STRING },
        path:    { type: SchemaType.STRING },
        content: { type: SchemaType.STRING, description: "New file content" },
        message: { type: SchemaType.STRING, description: "Commit message" },
        branch:  { type: SchemaType.STRING, description: "Target branch" },
      },
      required: ["owner", "repo", "path", "content", "message", "branch"],
    },
  },
  {
    name: "github_open_pr",
    description: "Open a pull request",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        owner: { type: SchemaType.STRING },
        repo:  { type: SchemaType.STRING },
        title: { type: SchemaType.STRING },
        body:  { type: SchemaType.STRING, description: "PR description (markdown)" },
        head:  { type: SchemaType.STRING, description: "Source branch" },
        base:  { type: SchemaType.STRING, description: "Target branch (default: main)" },
      },
      required: ["owner", "repo", "title", "body", "head"],
    },
  },

  // ── VERCEL TOOLS ──────────────────────────────────────────────
  {
    name: "vercel_list_deployments",
    description: "List recent Vercel deployments for a project",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        project_id: { type: SchemaType.STRING, description: "Vercel project ID or name" },
        limit:      { type: SchemaType.NUMBER, description: "Max deployments to return (default 10)" },
      },
      required: ["project_id"],
    },
  },
  {
    name: "vercel_get_deployment_logs",
    description: "Get build/runtime logs for a specific Vercel deployment",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        deployment_id: { type: SchemaType.STRING, description: "Vercel deployment ID (dpl_...)" },
      },
      required: ["deployment_id"],
    },
  },
  {
    name: "vercel_rollback_deployment",
    description: "Rollback a Vercel project to a previous deployment",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        project_id:    { type: SchemaType.STRING },
        deployment_id: { type: SchemaType.STRING, description: "Target deployment ID to rollback to" },
      },
      required: ["project_id", "deployment_id"],
    },
  },
];
