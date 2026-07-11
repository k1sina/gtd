"use client";

import clsx from "clsx";
import {
  Bot,
  Loader2,
  Plus,
  Send,
  Trash2,
  Wrench,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import {
  useChatMessages,
  useChatSessions,
  useDeleteChatSession,
  useSendChatMessage,
} from "@/lib/data";
import { useSpace } from "@/lib/space-context";

const QUICK_PROMPTS = [
  "What should I focus on today?",
  "Prioritise my inbox — suggest urgency and importance for each item",
  "Plan focus blocks for my day",
  "Which tasks are stalled without a next action?",
  "Help me prepare my weekly review",
];

const TOOL_LABELS: Record<string, string> = {
  list_tasks: "Reading tasks",
  create_task: "Creating task",
  update_task: "Updating task",
  complete_task: "Completing task",
  plan_day: "Planning the day",
};

interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  thinking?: string;
}

function MessageBubble({
  role,
  content,
}: {
  role: "user" | "assistant";
  content: ContentBlock[];
}) {
  const blocks = Array.isArray(content) ? content : [];
  const textBlocks = blocks.filter((b) => b.type === "text" && b.text?.trim());
  const toolBlocks = blocks.filter((b) => b.type === "tool_use");
  // Tool-result turns (role user, no text) render as nothing.
  if (textBlocks.length === 0 && toolBlocks.length === 0) return null;

  return (
    <div className={clsx("flex", role === "user" ? "justify-end" : "justify-start")}>
      <div
        className={clsx(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
          role === "user"
            ? "bg-accent text-white"
            : "border border-line bg-surface"
        )}
      >
        {toolBlocks.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {toolBlocks.map((b, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent"
              >
                <Wrench size={10} />
                {TOOL_LABELS[b.name ?? ""] ?? b.name}
              </span>
            ))}
          </div>
        )}
        {textBlocks.map((b, i) => (
          <p key={i} className="whitespace-pre-wrap leading-relaxed">
            {b.text}
          </p>
        ))}
      </div>
    </div>
  );
}

export default function AssistantPage() {
  const { currentSpace } = useSpace();
  const { data: sessions = [] } = useChatSessions();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const { data: messages = [] } = useChatMessages(sessionId);
  const sendMessage = useSendChatMessage();
  const deleteSession = useDeleteChatSession();

  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sendMessage.isPending]);

  async function send(text: string) {
    if (!text.trim() || !currentSpace || sendMessage.isPending) return;
    setError(null);
    setInput("");
    try {
      const result = await sendMessage.mutateAsync({
        sessionId,
        spaceId: currentSpace.id,
        message: text.trim(),
      });
      setSessionId(result.sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  const notConfigured = error === "assistant_not_configured";

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4">
      {/* Session list */}
      <aside className="flex w-48 shrink-0 flex-col">
        <Button
          size="sm"
          className="mb-2 w-full"
          onClick={() => {
            setSessionId(null);
            setError(null);
          }}
        >
          <Plus size={13} /> New chat
        </Button>
        <div className="thin-scroll flex-1 space-y-0.5 overflow-y-auto">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={clsx(
                "group flex items-center gap-1 rounded-md px-2 py-1.5 text-xs cursor-pointer",
                s.id === sessionId
                  ? "bg-accent-soft font-medium text-accent"
                  : "text-ink-soft hover:bg-ink/5"
              )}
              onClick={() => setSessionId(s.id)}
            >
              <span className="flex-1 truncate">{s.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSession.mutate(s.id);
                  if (s.id === sessionId) setSessionId(null);
                }}
                className="rounded p-0.5 text-ink-faint opacity-0 hover:text-red-600 group-hover:opacity-100 cursor-pointer"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Conversation */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="thin-scroll flex-1 space-y-3 overflow-y-auto pb-4">
          {messages.length === 0 && !sendMessage.isPending ? (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                <Bot size={24} />
              </div>
              <div className="text-center">
                <h1 className="font-semibold">Your GTD assistant</h1>
                <p className="mt-1 max-w-sm text-sm text-ink-soft">
                  Ask it to capture, prioritise, plan your day, or talk through
                  what matters. It can read and change your tasks.
                </p>
              </div>
              <div className="flex max-w-md flex-wrap justify-center gap-1.5">
                {QUICK_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => send(p)}
                    className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink-soft hover:border-accent hover:text-accent cursor-pointer"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  role={m.role}
                  content={m.content as ContentBlock[]}
                />
              ))}
              {sendMessage.isPending && (
                <div className="flex items-center gap-2 text-sm text-ink-faint">
                  <Loader2 size={14} className="animate-spin" />
                  Thinking…
                </div>
              )}
              <div ref={bottomRef} />
            </>
          )}
        </div>

        {notConfigured ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            The assistant needs an Anthropic API key — paste yours in{" "}
            <a href="/settings" className="font-medium underline">
              Settings → AI assistant
            </a>
            .
          </p>
        ) : (
          error && (
            <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )
        )}

        <form
          className="mt-2 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={2}
            placeholder="Message your assistant… (Enter to send)"
            className="flex-1 resize-none rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
          <Button
            type="submit"
            variant="primary"
            disabled={!input.trim() || sendMessage.isPending}
            className="h-[52px] w-[52px] rounded-xl p-0"
          >
            <Send size={17} />
          </Button>
        </form>
      </div>
    </div>
  );
}
