// agent/agent.ts — Agentic loop powered by Google Gemini
// Uses gemini-2.0-flash by default; falls back to gemini-1.5-pro for complex tasks
import { GoogleGenerativeAI, FunctionCallingMode, type Content, type GenerativeModel } from "@google/generative-ai";
import { GEMINI_TOOLS } from "./tools";
import * as GitHub from "./github";
import * as Vercel from "./vercel";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

const SYSTEM_INSTRUCTION = `You are a senior coding agent with access to GitHub and Vercel.
You help users: read/write code, automatically fix bugs and open PRs, monitor
Vercel deploy errors, and rollback failed deployments.

When asked to fix a bug:
1. Read the relevant file(s) from GitHub
2. Identify the issue
3. Create a new branch (fix/describe-the-bug)
4. Write the fixed file to the branch
5. Open a PR with a clear description

Be precise, technical, and always confirm what actions you took.`;

const MODEL_CONFIG = {
  systemInstruction: SYSTEM_INSTRUCTION,
  tools: [{ functionDeclarations: GEMINI_TOOLS }],
  toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.AUTO } },
};

// Fast model for most tasks
const flashModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash", ...MODEL_CONFIG });

// Fallback for complex multi-file / large-context tasks
const proModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro", ...MODEL_CONFIG });

// ── Complexity heuristic ──────────────────────────────────────
function isComplexTask(message: string): boolean {
  const complexPatterns = [
    /multiple files?/i,
    /refactor/i,
    /architect/i,
    /across (the |all )?(repo|codebase|files)/i,
    /\d{2,} files?/i,
    /full (rewrite|migration)/i,
    /system.?wide/i,
    /large (codebase|project)/i,
  ];
  return complexPatterns.some(p => p.test(message));
}

function pickModel(message: string): { model: GenerativeModel; name: string } {
  if (isComplexTask(message)) {
    console.log("[agent] Complex task detected → using gemini-1.5-pro");
    return { model: proModel, name: "gemini-1.5-pro" };
  }
  console.log("[agent] Standard task → using gemini-2.0-flash");
  return { model: flashModel, name: "gemini-2.0-flash" };
}

// ── Tool dispatcher ────────────────────────────────────────────
async function runTool(name: string, args: any): Promise<string> {
  console.log(`[tool] ${name}`, args);
  try {
    let result: any;
    switch (name) {
      case "github_read_file":           result = await GitHub.github_read_file(args); break;
      case "github_list_commits":        result = await GitHub.github_list_commits(args); break;
      case "github_create_branch":       result = await GitHub.github_create_branch(args); break;
      case "github_write_file":          result = await GitHub.github_write_file(args); break;
      case "github_open_pr":             result = await GitHub.github_open_pr(args); break;
      case "vercel_list_deployments":    result = await Vercel.vercel_list_deployments(args); break;
      case "vercel_get_deployment_logs": result = await Vercel.vercel_get_deployment_logs(args); break;
      case "vercel_rollback_deployment": result = await Vercel.vercel_rollback_deployment(args); break;
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
    return JSON.stringify(result, null, 2);
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

// ── Core agentic loop (model-agnostic) ────────────────────────
async function agentLoop(
  selectedModel: GenerativeModel,
  userMessage: string,
  history: Content[],
  onToken?: (text: string) => void,
): Promise<{ reply: string; history: Content[] }> {
  const chat = selectedModel.startChat({ history });
  let result = await chat.sendMessage(userMessage);

  while (true) {
    const response = result.response;
    const parts = response.candidates?.[0]?.content?.parts ?? [];

    const textParts = parts.filter(p => p.text).map(p => p.text!).join("");
    if (textParts && onToken) onToken(textParts);

    const fnCalls = parts.filter(p => p.functionCall);
    if (fnCalls.length === 0) {
      const updatedHistory = await chat.getHistory();
      return { reply: response.text(), history: updatedHistory };
    }

    const fnResponses = await Promise.all(
      fnCalls.map(async (part) => {
        const { name, args } = part.functionCall!;
        const output = await runTool(name, args);
        return { functionResponse: { name, response: { output } } };
      })
    );

    result = await chat.sendMessage(fnResponses);
  }
}

// ── Public runAgent with Flash → Pro fallback ─────────────────
export async function runAgent(
  userMessage: string,
  history: Content[] = [],
  onToken?: (text: string) => void,
): Promise<{ reply: string; history: Content[]; modelUsed: string }> {

  const { model, name } = pickModel(userMessage);

  try {
    const { reply, history: updatedHistory } = await agentLoop(model, userMessage, history, onToken);
    return { reply, history: updatedHistory, modelUsed: name };

  } catch (err: any) {
    // Flash failed → fallback to Pro automatically
    if (name === "gemini-2.0-flash") {
      console.warn(`[agent] Flash failed (${err.message}) → falling back to gemini-1.5-pro`);
      if (onToken) onToken("\n\n⚡ Switching to Gemini Pro for this request...\n\n");
      const { reply, history: updatedHistory } = await agentLoop(proModel, userMessage, history, onToken);
      return { reply, history: updatedHistory, modelUsed: "gemini-1.5-pro (fallback)" };
    }
    throw err;
  }
}
