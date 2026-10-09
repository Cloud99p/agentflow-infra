/**
 * Bitget Skill Hub — market-data MCP client.
 *
 * The official Bitget Skill Hub ships five market-analysis skills backed by a
 * public MCP server (no API key required for 18 of its 19 tools). This module
 * is a minimal streamable-HTTP MCP client: initialize, then tools/call.
 *
 * Design rules, same as the rest of this codebase:
 *  - Nothing is simulated. If the server is unreachable or errors, the call
 *    throws; callers decide whether the feature is degraded.
 *  - No silent fallbacks. A failed tool never returns a plausible-looking zero.
 *
 * @see https://www.npmjs.com/package/bitget-skill-hub
 */

const DEFAULT_MCP_URL = 'https://datahub.noxiaohao.com/mcp';
const PROTOCOL_VERSION = '2024-11-05';

export interface McpToolResult {
  ok: boolean;
  /** Parsed JSON payload when the tool returned JSON text. */
  data: any;
  /** Raw text, kept for tools that return prose. */
  raw: string;
  /** Tool-level error flag reported by the server (isError). */
  toolError: boolean;
  durationMs: number;
}

export interface SkillHubStatus {
  reachable: boolean;
  serverName?: string;
  serverVersion?: string;
  toolCount: number;
  tools: string[];
  error?: string;
}

/** Streamable-HTTP MCP client for the Bitget Skill Hub market-data server. */
export class SkillHubClient {
  private url: string;
  private sessionId: string | null = null;
  private nextId = 1;
  private tools: string[] = [];
  private serverInfo: { name?: string; version?: string } = {};
  private lastError: string | null = null;
  private timeoutMs: number;

  constructor(options: { url?: string; timeoutMs?: number } = {}) {
    this.url = options.url || process.env.BITGET_MCP_URL || DEFAULT_MCP_URL;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  /**
   * POST a JSON-RPC message and parse the SSE-framed response.
   * The server replies as `text/event-stream` with `data: {...}` lines.
   */
  private async rpc(method: string, params: any, signal?: AbortSignal): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

    try {
      const headers: Record<string, string> = {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
      };
      if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;

      const res = await fetch(this.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: this.nextId++, method, params }),
        signal: controller.signal,
      });

      // The server hands out the session id on initialize.
      const sid = res.headers.get('mcp-session-id');
      if (sid) this.sessionId = sid;

      if (res.status === 404 && this.sessionId) {
        // Session expired; drop it so the caller's retry re-initializes.
        this.sessionId = null;
      }

      const text = await res.text();

      if (!res.ok) {
        throw new Error(`MCP HTTP ${res.status}: ${text.slice(0, 200)}`);
      }

      // SSE frames look like: "event: message\ndata: {...}\n\n"
      const payloads = text
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .filter(Boolean);

      if (payloads.length === 0) throw new Error(`MCP returned no data frame: ${text.slice(0, 200)}`);

      const msg = JSON.parse(payloads[payloads.length - 1]);
      if (msg.error) throw new Error(msg.error.message || 'MCP JSON-RPC error');
      return msg.result;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Handshake once; subsequent calls reuse the session. */
  async connect(): Promise<void> {
    if (this.sessionId && this.tools.length > 0) return;

    const result = await this.rpc('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'agentflow-infra', version: '1.0.0' },
    });

    this.serverInfo = {
      name: result?.serverInfo?.name,
      version: result?.serverInfo?.version,
    };

    const toolsResult = await this.rpc('tools/list', {});
    this.tools = (toolsResult?.tools ?? []).map((t: any) => t.name);
    this.lastError = null;
  }

  /** Call a tool, returning a never-throwing result envelope. */
  async callTool(name: string, args: Record<string, any> = {}): Promise<McpToolResult> {
    const started = Date.now();
    try {
      await this.connect();
      const result = await this.rpc('tools/call', { name, arguments: args });

      const raw = (result?.content ?? [])
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('\n');

      let data: any = null;
      try {
        data = JSON.parse(raw);
      } catch {
        data = null; // prose-returning tool
      }

      return {
        ok: !result?.isError,
        data,
        raw,
        toolError: Boolean(result?.isError),
        durationMs: Date.now() - started,
      };
    } catch (error: any) {
      this.lastError = error.message;
      return { ok: false, data: null, raw: '', toolError: true, durationMs: Date.now() - started };
    }
  }

  /** Capability probe used by the dashboard's status endpoint. */
  async status(): Promise<SkillHubStatus> {
    try {
      await this.connect();
      return {
        reachable: true,
        serverName: this.serverInfo.name,
        serverVersion: this.serverInfo.version,
        toolCount: this.tools.length,
        tools: this.tools,
      };
    } catch (error: any) {
      return {
        reachable: false,
        toolCount: 0,
        tools: [],
        error: this.lastError ?? error.message,
      };
    }
  }

  get toolNames(): string[] {
    return [...this.tools];
  }
}

/** Shared client. */
export const skillHub = new SkillHubClient();
