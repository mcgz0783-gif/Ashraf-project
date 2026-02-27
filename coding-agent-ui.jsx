import { useState, useRef, useEffect } from "react";

const SYSTEM_PROMPT = `You are a senior coding agent that manages GitHub repositories and Vercel deployments. You help users:
- Read and understand code from GitHub repos
- Find and fix bugs, then open Pull Requests
- Monitor Vercel deployment errors
- Rollback failed Vercel deployments

When the user asks you something, respond as the agent would — describe what actions you're taking (like "Fetching latest commit from main branch...", "Analyzing error logs...", "Opening PR #42..."). Be concise, technical, and action-oriented. Use markdown for code blocks. Simulate realistic agent behavior with tool usage narration.`;

const WELCOME = `👾 **Coding Agent Online**

I'm connected to your GitHub and Vercel. Here's what I can do:

- 🔍 **Read/write code** — browse repos, create/edit files
- 🐛 **Fix bugs & open PRs** — detect issues, patch, and submit PRs
- 🚨 **Monitor Vercel errors** — watch deploy logs, catch failures  
- ⏪ **Rollback deployments** — instantly revert bad deploys

What would you like me to work on?`;

function parseMarkdown(text) {
  return text
    .replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) =>
      `<pre><code class="lang-${lang || ''}">${code.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>`)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<)(.+)$/gm, "$1");
}

const ToolBadge = ({ name }) => {
  const icons = {
    github: "⚡",
    vercel: "▲",
    search: "🔍",
    patch: "🔧",
    pr: "📬",
    rollback: "⏪",
  };
  const match = Object.keys(icons).find(k => name.toLowerCase().includes(k));
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "4px",
      background: "rgba(0,255,140,0.08)", border: "1px solid rgba(0,255,140,0.2)",
      borderRadius: "4px", padding: "2px 8px", fontSize: "11px",
      color: "#00ff8c", fontFamily: "monospace", marginRight: "6px", marginBottom: "4px"
    }}>
      {icons[match] || "🔩"} {name}
    </span>
  );
};

export default function App() {
  const [messages, setMessages] = useState([
    { role: "assistant", content: WELCOME, tools: [] }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState("");
  const [incidents, setIncidents] = useState([]);
  const [showIncidents, setShowIncidents] = useState(false);

  // Poll /incidents every 5s to show webhook-triggered auto-fixes
  useEffect(() => {
    const fetchIncidents = () =>
      fetch("http://localhost:3001/incidents")
        .then(r => r.json())
        .then(d => setIncidents(d.incidents || []))
        .catch(() => {});
    fetchIncidents();
    const id = setInterval(fetchIncidents, 5000);
    return () => clearInterval(id);
  }, []);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  const detectTools = (content) => {
    const tools = [];
    if (/github|repo|commit|branch|PR|pull request|file|code/i.test(content)) tools.push("github");
    if (/vercel|deploy|build|rollback/i.test(content)) tools.push("vercel");
    if (/search|look(ing)?|find|fetch|check/i.test(content)) tools.push("search");
    if (/fix|patch|update|edit|chang/i.test(content)) tools.push("patch");
    if (/PR|pull request|open(ing)?/i.test(content)) tools.push("pr");
    if (/rollback|revert/i.test(content)) tools.push("rollback");
    return [...new Set(tools)];
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setStreaming("");

    const history = newMessages.map(m => ({ role: m.role, content: m.content }));

    try {
      // Calls your local Express server (server.ts) which uses Gemini as the brain
      const res = await fetch("http://localhost:3001/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input.trim(), session_id: "ui-session" }),
      });
      const data = await res.json();
      const text = data.reply || "Error getting response.";
      const tools = detectTools(text);
      setMessages(prev => [...prev, { role: "assistant", content: text, tools, modelUsed: data.modelUsed }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", content: "⚠️ Connection error. Make sure the agent server is running (`npm run dev`).", tools: [] }]);
    } finally {
      setLoading(false);
      setStreaming("");
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const quickActions = [
    "Show recent Vercel deploy errors",
    "Find bugs in my main branch",
    "Rollback last deployment",
    "Open a PR to fix the latest error",
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Sora:wght@300;400;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #080c0f; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(0,255,140,0.2); border-radius: 2px; }
        code { background: rgba(0,255,140,0.06); padding: 2px 6px; border-radius: 3px; font-family: 'Space Mono', monospace; font-size: 12px; color: #00ff8c; }
        pre { background: rgba(0,0,0,0.5); border: 1px solid rgba(0,255,140,0.12); border-radius: 8px; padding: 16px; overflow-x: auto; margin: 12px 0; }
        pre code { background: none; padding: 0; color: #a8ffcb; font-size: 12px; }
        ul { padding-left: 20px; margin: 8px 0; }
        li { margin: 4px 0; color: #8fa8a0; }
        strong { color: #e0fff0; }
        p { margin: 4px 0; }

        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes slideUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes scanline { 0%{transform:translateY(-100%)} 100%{transform:translateY(100vh)} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes glow { 0%,100%{box-shadow:0 0 10px rgba(0,255,140,0.1)} 50%{box-shadow:0 0 20px rgba(0,255,140,0.25)} }
      `}</style>

      <div style={{
        width: "100vw", height: "100vh", background: "#080c0f",
        display: "flex", flexDirection: "column", fontFamily: "'Sora', sans-serif",
        overflow: "hidden", position: "relative",
      }}>

        {/* Scanline effect */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: "2px",
          background: "linear-gradient(transparent, rgba(0,255,140,0.04), transparent)",
          animation: "scanline 8s linear infinite", pointerEvents: "none", zIndex: 10,
        }} />

        {/* Grid bg */}
        <div style={{
          position: "absolute", inset: 0, zIndex: 0,
          backgroundImage: "linear-gradient(rgba(0,255,140,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,140,0.03) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }} />

        {/* Header */}
        <div style={{
          padding: "14px 24px", borderBottom: "1px solid rgba(0,255,140,0.1)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(10px)",
          position: "relative", zIndex: 5,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "8px",
              background: "linear-gradient(135deg, #00ff8c22, #00ff8c44)",
              border: "1px solid rgba(0,255,140,0.4)", display: "flex",
              alignItems: "center", justifyContent: "center", fontSize: "16px",
              animation: "glow 3s ease-in-out infinite",
            }}>👾</div>
            <div>
              <div style={{ fontFamily: "'Space Mono'", fontSize: "13px", color: "#00ff8c", letterSpacing: "0.1em" }}>CODING AGENT</div>
              <div style={{ fontSize: "10px", color: "#3a6655", letterSpacing: "0.15em", marginTop: "1px" }}>GITHUB · VERCEL · AUTO-FIX</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button onClick={() => setShowIncidents(v => !v)} style={{
              position: "relative", padding: "5px 10px", background: "rgba(255,80,80,0.06)",
              border: "1px solid rgba(255,80,80,0.2)", borderRadius: "6px",
              color: incidents.some(i => i.status === "running") ? "#ff5050" : "#6a3535",
              fontSize: "11px", fontFamily: "'Space Mono'", cursor: "pointer",
              transition: "all 0.2s",
            }}>
              🚨 INCIDENTS
              {incidents.length > 0 && (
                <span style={{
                  position: "absolute", top: "-6px", right: "-6px",
                  width: "16px", height: "16px", borderRadius: "50%",
                  background: incidents.some(i => i.status === "running") ? "#ff5050" : "#4a2020",
                  color: "#fff", fontSize: "9px", display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "'Space Mono'",
                }}>{incidents.length}</span>
              )}
            </button>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#00ff8c", animation: "pulse 2s infinite", display: "inline-block" }} />
            <span style={{ fontSize: "11px", fontFamily: "'Space Mono'", color: "#3a6655" }}>ONLINE</span>
          </div>
        </div>

        {/* Incidents Panel */}
        {showIncidents && (
          <div style={{
            position: "absolute", top: "62px", right: "20px", width: "380px", zIndex: 20,
            background: "#0a0f0c", border: "1px solid rgba(255,80,80,0.2)",
            borderRadius: "10px", overflow: "hidden",
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
            animation: "slideUp 0.2s ease",
          }}>
            <div style={{
              padding: "10px 14px", borderBottom: "1px solid rgba(255,80,80,0.1)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontFamily: "'Space Mono'", fontSize: "11px", color: "#ff6060", letterSpacing: "0.1em" }}>
                🚨 WEBHOOK AUTO-FIX LOG
              </span>
              <button onClick={() => setShowIncidents(false)} style={{
                background: "none", border: "none", color: "#4a2020", cursor: "pointer", fontSize: "14px",
              }}>✕</button>
            </div>
            <div style={{ maxHeight: "340px", overflowY: "auto", padding: "8px" }}>
              {incidents.length === 0 ? (
                <div style={{ padding: "20px", textAlign: "center", color: "#2a4030", fontSize: "12px", fontFamily: "'Space Mono'" }}>
                  No incidents yet.<br/>Waiting for Vercel deploy failures...
                </div>
              ) : incidents.map(inc => (
                <div key={inc.id} style={{
                  padding: "10px 12px", marginBottom: "6px", borderRadius: "7px",
                  background: inc.status === "running" ? "rgba(255,200,0,0.04)"
                            : inc.status === "fixed"   ? "rgba(0,255,140,0.04)"
                            : "rgba(255,80,80,0.04)",
                  border: `1px solid ${inc.status === "running" ? "rgba(255,200,0,0.15)"
                           : inc.status === "fixed"   ? "rgba(0,255,140,0.12)"
                           : "rgba(255,80,80,0.15)"}`,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span style={{
                      fontSize: "10px", fontFamily: "'Space Mono'", padding: "2px 6px", borderRadius: "4px",
                      background: inc.status === "running" ? "rgba(255,200,0,0.1)"
                                : inc.status === "fixed"   ? "rgba(0,255,140,0.1)"
                                : "rgba(255,80,80,0.1)",
                      color: inc.status === "running" ? "#ffc800"
                           : inc.status === "fixed"   ? "#00ff8c"
                           : "#ff5050",
                    }}>
                      {inc.status === "running" ? "⟳ FIXING" : inc.status === "fixed" ? "✓ FIXED" : "✗ FAILED"}
                    </span>
                    <span style={{ fontSize: "10px", color: "#2a4030", fontFamily: "'Space Mono'" }}>
                      {new Date(inc.triggeredAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#8fa8a0", marginBottom: "2px" }}>
                    <strong style={{ color: "#c8ffe0" }}>{inc.project}</strong> / {inc.branch}
                  </div>
                  <div style={{ fontSize: "10px", color: "#3a6655", fontFamily: "'Space Mono'" }}>
                    {inc.deploymentId}
                  </div>
                  {inc.modelUsed && (
                    <div style={{ marginTop: "4px", fontSize: "10px", color: inc.modelUsed.includes("pro") ? "#80b0ff" : "#00cc70" }}>
                      {inc.modelUsed.includes("pro") ? "◆" : "⚡"} {inc.modelUsed}
                    </div>
                  )}
                  {inc.error && (
                    <div style={{ marginTop: "4px", fontSize: "10px", color: "#ff5050", fontFamily: "monospace" }}>
                      {inc.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <div style={{
          flex: 1, overflowY: "auto", padding: "24px 20px",
          display: "flex", flexDirection: "column", gap: "20px",
          position: "relative", zIndex: 2,
        }}>
          {messages.map((msg, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              animation: "slideUp 0.3s ease",
            }}>
              {msg.role === "assistant" && (
                <div style={{
                  width: "28px", height: "28px", borderRadius: "6px", flexShrink: 0,
                  background: "rgba(0,255,140,0.08)", border: "1px solid rgba(0,255,140,0.2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "13px", marginRight: "10px", marginTop: "2px",
                }}>👾</div>
              )}
              <div style={{ maxWidth: "72%" }}>
                {(msg.tools?.length > 0 || msg.modelUsed) && (
                  <div style={{ marginBottom: "6px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px" }}>
                    {msg.tools?.map(t => <ToolBadge key={t} name={t} />)}
                    {msg.modelUsed && (
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: "4px",
                        background: msg.modelUsed.includes("pro") ? "rgba(100,160,255,0.08)" : "rgba(0,255,140,0.06)",
                        border: `1px solid ${msg.modelUsed.includes("pro") ? "rgba(100,160,255,0.2)" : "rgba(0,255,140,0.15)"}`,
                        borderRadius: "4px", padding: "2px 8px", fontSize: "10px",
                        color: msg.modelUsed.includes("pro") ? "#80b0ff" : "#00cc70",
                        fontFamily: "monospace", letterSpacing: "0.05em",
                      }}>
                        {msg.modelUsed.includes("pro") ? "◆" : "⚡"} {msg.modelUsed}
                      </span>
                    )}
                  </div>
                )}
                <div style={{
                  padding: "12px 16px", borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "4px 14px 14px 14px",
                  background: msg.role === "user"
                    ? "linear-gradient(135deg, rgba(0,255,140,0.12), rgba(0,200,100,0.08))"
                    : "rgba(255,255,255,0.03)",
                  border: msg.role === "user" ? "1px solid rgba(0,255,140,0.2)" : "1px solid rgba(255,255,255,0.06)",
                  color: msg.role === "user" ? "#c8ffe0" : "#8fa8a0",
                  fontSize: "13.5px", lineHeight: "1.7",
                }}>
                  <div dangerouslySetInnerHTML={{ __html: parseMarkdown(msg.content) }} />
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", animation: "slideUp 0.3s ease" }}>
              <div style={{
                width: "28px", height: "28px", borderRadius: "6px",
                background: "rgba(0,255,140,0.08)", border: "1px solid rgba(0,255,140,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px",
              }}>👾</div>
              <div style={{
                padding: "12px 16px", background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)", borderRadius: "4px 14px 14px 14px",
                display: "flex", gap: "5px", alignItems: "center",
              }}>
                {[0, 0.2, 0.4].map((d, i) => (
                  <span key={i} style={{
                    width: "5px", height: "5px", borderRadius: "50%", background: "#00ff8c",
                    animation: `pulse 1.2s ${d}s infinite`,
                    display: "inline-block",
                  }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Quick actions */}
        {messages.length <= 1 && (
          <div style={{
            padding: "0 20px 12px", display: "flex", gap: "8px", flexWrap: "wrap",
            position: "relative", zIndex: 2,
          }}>
            {quickActions.map(a => (
              <button key={a} onClick={() => { setInput(a); textareaRef.current?.focus(); }} style={{
                padding: "6px 12px", background: "rgba(0,255,140,0.05)",
                border: "1px solid rgba(0,255,140,0.15)", borderRadius: "6px",
                color: "#3a8c65", fontSize: "11px", cursor: "pointer",
                fontFamily: "'Sora'", transition: "all 0.2s",
              }}
                onMouseEnter={e => { e.target.style.background = "rgba(0,255,140,0.1)"; e.target.style.color = "#00ff8c"; }}
                onMouseLeave={e => { e.target.style.background = "rgba(0,255,140,0.05)"; e.target.style.color = "#3a8c65"; }}>
                {a}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{
          padding: "14px 20px 20px", borderTop: "1px solid rgba(0,255,140,0.08)",
          background: "rgba(0,0,0,0.5)", backdropFilter: "blur(10px)",
          position: "relative", zIndex: 5,
        }}>
          <div style={{
            display: "flex", gap: "10px", alignItems: "flex-end",
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(0,255,140,0.15)",
            borderRadius: "12px", padding: "10px 14px",
            transition: "border-color 0.2s",
          }}
            onFocusCapture={e => e.currentTarget.style.borderColor = "rgba(0,255,140,0.35)"}
            onBlurCapture={e => e.currentTarget.style.borderC
