// Remote MCP endpoint (Streamable HTTP, stateless). Exposes the same 7 tools
// as the in-app assistant so any MCP client can use Clarity without the repo
// installed locally. Auth: `Authorization: Basic base64(email:password)` —
// the Supabase account credentials; every query runs as that user under RLS.

import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ASSISTANT_TOOLS, executeAssistantTool } from "@/lib/assistant-tools";

export const maxDuration = 60;

const SERVER_INFO = { name: "clarity-gtd", version: "0.1.0" };
const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

interface Session {
  userId: string;
  spaceId: string;
  accessToken: string;
  expiresAt: number; // ms epoch
}

// Keyed by a hash of the Basic credentials so a warm serverless instance
// skips the Supabase sign-in round-trip on every tool call.
const sessions = new Map<string, Session>();

function anonClient(accessToken?: string): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(accessToken
        ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
        : {}),
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

async function authenticate(request: NextRequest): Promise<Session | null> {
  const credentials = request.headers
    .get("authorization")
    ?.match(/^Basic (.+)$/i)?.[1];
  if (!credentials) return null;

  const cacheKey = createHash("sha256").update(credentials).digest("hex");
  const cached = sessions.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached;

  const decoded = Buffer.from(credentials, "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator < 1) return null;
  const email = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);

  const { data, error } = await anonClient().auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session || !data.user) return null;

  const authed = anonClient(data.session.access_token);
  let spaceId = request.headers.get("x-clarity-space");
  if (!spaceId) {
    const { data: spaces } = await authed
      .from("spaces")
      .select("id")
      .eq("is_personal", true)
      .limit(1);
    spaceId = spaces?.[0]?.id ?? null;
  }
  if (!spaceId) return null;

  const session: Session = {
    userId: data.user.id,
    spaceId,
    accessToken: data.session.access_token,
    expiresAt: (data.session.expires_at ?? 0) * 1000,
  };
  sessions.set(cacheKey, session);
  return session;
}

type JsonRpcMessage = {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
};

function rpcResult(id: number | string | null, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: number | string | null, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handleMessage(
  message: JsonRpcMessage,
  session: Session
): Promise<unknown | null> {
  const { id, method, params } = message;
  // Notifications (no id) get no response.
  if (id === undefined || id === null) return null;
  if (!method) return rpcError(id, -32600, "Invalid request");

  switch (method) {
    case "initialize": {
      const requested = params?.protocolVersion as string | undefined;
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(requested ?? "")
          ? requested
          : PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, {
        tools: ASSISTANT_TOOLS.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.input_schema,
        })),
      });
    case "tools/call": {
      const name = params?.name as string;
      const args = (params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const result = await executeAssistantTool(name, args, {
          supabase: anonClient(session.accessToken),
          userId: session.userId,
          spaceId: session.spaceId,
        });
        return rpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        });
      } catch (error) {
        return rpcResult(id, {
          content: [
            {
              type: "text",
              text: error instanceof Error ? error.message : String(error),
            },
          ],
          isError: true,
        });
      }
    }
    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

export async function POST(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) {
    return NextResponse.json(
      { error: "unauthorized" },
      {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Clarity MCP"' },
      }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(rpcError(null, -32700, "Parse error"), {
      status: 400,
    });
  }

  const messages = Array.isArray(body) ? body : [body];
  const responses = (
    await Promise.all(
      messages.map((m) => handleMessage(m as JsonRpcMessage, session))
    )
  ).filter((r) => r !== null);

  // Notification-only posts get 202 Accepted with no body.
  if (responses.length === 0) return new Response(null, { status: 202 });

  return NextResponse.json(Array.isArray(body) ? responses : responses[0]);
}

// This server is stateless — no SSE stream to resume, no session to delete.
export function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

export function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
