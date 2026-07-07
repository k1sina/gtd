import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import {
  ASSISTANT_TOOLS,
  executeAssistantTool,
} from "@/lib/assistant-tools";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 300;

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
const MAX_LOOP_ITERATIONS = 12;

function systemPrompt(displayName: string): string {
  const now = new Date();
  return `You are Clarity's assistant — a GTD (Getting Things Done) coach embedded in the user's task manager. The user is ${displayName || "the user"}.

You can act on their system through tools: list/create/update/complete tasks, manage projects, and plan focus blocks for today. Everything you read or change is scoped to the user's current space.

GTD principles you help uphold:
- Capture everything; clarify inbox items into next actions, projects, waiting-for, or someday.
- Every active project needs a next action.
- Prioritise by importance first, then urgency (Eisenhower). Urgency and importance are 1-4 scales; 3+ counts as high.
- The weekly review keeps the system trustworthy.

Behavior:
- Use tools to look at real data before advising; never invent tasks or numbers.
- When the user asks you to do something (add, reprioritise, complete, plan), do it with tools, then confirm briefly what changed.
- When asked to prioritise the inbox or suggest urgency/importance, read the tasks, set sensible values via update_task, and summarise your reasoning in one line per task.
- Be concise and practical. Lead with the answer or the action taken. No filler.
- For destructive or ambiguous requests (cancelling many tasks, changing dates you're unsure about), ask first.

Today is ${now.toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" })}, local time ${now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`;
}

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "assistant_not_configured" },
      { status: 501 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const message: string = (body.message ?? "").trim();
  const spaceId: string | undefined = body.spaceId;
  let sessionId: string | undefined = body.sessionId;
  if (!message || !spaceId) {
    return NextResponse.json(
      { error: "message and spaceId required" },
      { status: 400 }
    );
  }

  // Load or create the chat session.
  if (!sessionId) {
    const { data: session, error } = await supabase
      .from("chat_sessions")
      .insert({
        user_id: user.id,
        title: message.length > 60 ? `${message.slice(0, 57)}…` : message,
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    sessionId = session.id;
  }

  const { data: history, error: historyError } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at");
  if (historyError) {
    return NextResponse.json({ error: historyError.message }, { status: 500 });
  }

  const messages: Anthropic.MessageParam[] = (history ?? []).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content as Anthropic.ContentBlockParam[],
  }));
  messages.push({ role: "user", content: [{ type: "text", text: message }] });

  await supabase.from("chat_messages").insert({
    session_id: sessionId,
    role: "user",
    content: [{ type: "text", text: message }],
  });

  const anthropic = new Anthropic();
  const toolCtx = { supabase, userId: user.id, spaceId };
  const newAssistantMessages: Anthropic.ContentBlock[][] = [];

  try {
    for (let i = 0; i < MAX_LOOP_ITERATIONS; i++) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 8000,
        thinking: { type: "adaptive" },
        system: systemPrompt(
          (user.user_metadata?.display_name as string) ?? ""
        ),
        tools: ASSISTANT_TOOLS,
        messages,
      });

      messages.push({ role: "assistant", content: response.content });
      newAssistantMessages.push(response.content);
      await supabase.from("chat_messages").insert({
        session_id: sessionId,
        role: "assistant",
        content: response.content,
      });

      if (response.stop_reason === "refusal") break;
      if (response.stop_reason === "pause_turn") continue;
      if (response.stop_reason !== "tool_use") break;

      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        try {
          const result = await executeAssistantTool(
            toolUse.name,
            toolUse.input as Record<string, unknown>,
            toolCtx
          );
          results.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          });
        } catch (err) {
          results.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: err instanceof Error ? err.message : "Tool failed",
            is_error: true,
          });
        }
      }

      messages.push({ role: "user", content: results });
      await supabase.from("chat_messages").insert({
        session_id: sessionId,
        role: "user",
        content: results,
      });
    }

    await supabase
      .from("chat_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", sessionId);

    return NextResponse.json({
      sessionId,
      messages: newAssistantMessages,
    });
  } catch (err) {
    console.error("Chat failed:", err);
    const detail =
      err instanceof Anthropic.APIError ? err.message : "Assistant error";
    return NextResponse.json({ error: detail, sessionId }, { status: 502 });
  }
}
