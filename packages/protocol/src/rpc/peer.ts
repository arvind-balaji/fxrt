import { getLogger } from "@logtape/logtape";
import { z } from "zod";
import {
  RPC_ERRORS,
  type RpcError,
  RpcException,
  RpcId,
  RpcNotification,
  RpcRequest,
  RpcResponse,
  type RpcResult,
} from "./jsonrpc.ts";
import type { Socket } from "./socket.ts";

const log = getLogger(["fxrt", "rpc"]);

export interface MethodSpec {
  params: z.ZodType;
  result: z.ZodType;
}

/** The methods and notifications one side of a connection handles. */
export interface Api {
  methods: Record<string, MethodSpec>;
  notifications: Record<string, z.ZodType>;
}

export function defineApi<A extends Api>(api: A): A {
  return api;
}

type MethodName<A extends Api> = keyof A["methods"] & string;
type NotificationName<A extends Api> = keyof A["notifications"] & string;
type Spec<A extends Api, M extends MethodName<A>> = A["methods"][M];

export type Handler<A extends Api, M extends MethodName<A>> = (
  params: z.output<Spec<A, M>["params"]>,
) => z.input<Spec<A, M>["result"]> | Promise<z.input<Spec<A, M>["result"]>>;

export type Listener<A extends Api, N extends NotificationName<A>> = (
  params: z.output<A["notifications"][N]>,
) => void;

interface Pending {
  result: z.ZodType;
  resolve: (r: RpcResult<unknown>) => void;
}

const CLOSED: RpcError = { code: RPC_ERRORS.connection_closed, message: "connection closed" };

/**
 * One end of a bidirectional JSON-RPC connection. `Local` is what this end
 * handles, `Remote` is what the other end handles. Both ends send requests.
 */
export class Peer<Local extends Api, Remote extends Api> {
  readonly #socket: Socket;
  readonly #local: Local;
  readonly #remote: Remote;
  readonly #pending = new Map<number, Pending>();
  readonly #handlers = new Map<string, (params: unknown) => unknown>();
  readonly #listeners = new Map<string, (params: unknown) => void>();
  readonly #closeListeners: (() => void)[] = [];
  #nextId = 1;
  #closed = false;

  constructor(socket: Socket, apis: { local: Local; remote: Remote }) {
    this.#socket = socket;
    this.#local = apis.local;
    this.#remote = apis.remote;
    socket.onMessage((data) => this.#receive(data));
    socket.onClose(() => this.#onClosed());
  }

  get closed(): boolean {
    return this.#closed;
  }

  handle<M extends MethodName<Local>>(method: M, handler: Handler<Local, M>): void {
    this.#handlers.set(method, handler as (params: unknown) => unknown);
  }

  on<N extends NotificationName<Local>>(name: N, listener: Listener<Local, N>): void {
    this.#listeners.set(name, listener as (params: unknown) => void);
  }

  onClose(listener: () => void): void {
    if (this.#closed) listener();
    else this.#closeListeners.push(listener);
  }

  /** Never rejects: transport and remote errors come back as `{ ok: false }`. */
  request<M extends MethodName<Remote>>(
    method: M,
    params: z.input<Spec<Remote, M>["params"]>,
  ): Promise<RpcResult<z.output<Spec<Remote, M>["result"]>>> {
    const spec = this.#remote.methods[method] as MethodSpec;
    const id = this.#nextId++;
    return new Promise((resolve) => {
      if (this.#closed) return resolve({ ok: false, error: CLOSED });
      this.#pending.set(id, { result: spec.result, resolve: resolve as Pending["resolve"] });
      if (!this.#send({ jsonrpc: "2.0", id, method, params })) {
        this.#pending.delete(id);
        resolve({ ok: false, error: CLOSED });
      }
    });
  }

  /** Dropped silently if the connection is closed. */
  notify<N extends NotificationName<Remote>>(
    name: N,
    params: z.input<Remote["notifications"][N]>,
  ): void {
    this.#send({ jsonrpc: "2.0", method: name, params });
  }

  close(): void {
    this.#socket.close();
    this.#onClosed();
  }

  #send(message: object): boolean {
    if (this.#closed) return false;
    try {
      this.#socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      log.warning("send failed", { error });
      return false;
    }
  }

  #sendError(id: RpcId | null, code: number, message: string, data?: unknown): void {
    this.#send({ jsonrpc: "2.0", id, error: { code, message, data } });
  }

  #receive(data: string): void {
    let message: unknown;
    try {
      message = JSON.parse(data);
    } catch {
      this.#sendError(null, RPC_ERRORS.parse_error, "parse error");
      return;
    }
    if (typeof message !== "object" || message === null || Array.isArray(message)) {
      this.#sendError(null, RPC_ERRORS.invalid_request, "expected a JSON object");
      return;
    }
    if (!("method" in message)) {
      this.#onResponse(message);
      return;
    }
    if ("id" in message) {
      void this.#onRequest(message);
    } else {
      this.#onNotification(message);
    }
  }

  async #onRequest(message: object): Promise<void> {
    const parsed = RpcRequest.safeParse(message);
    if (!parsed.success) {
      const id = RpcId.safeParse((message as { id?: unknown }).id);
      return this.#sendError(
        id.success ? id.data : null,
        RPC_ERRORS.invalid_request,
        "invalid request",
      );
    }
    const { id, method } = parsed.data;
    const handler = this.#handlers.get(method);
    const spec = Object.hasOwn(this.#local.methods, method)
      ? this.#local.methods[method]
      : undefined;
    if (!handler || !spec) {
      return this.#sendError(id, RPC_ERRORS.method_not_found, `method not found: ${method}`);
    }
    const params = spec.params.safeParse(parsed.data.params);
    if (!params.success) {
      return this.#sendError(id, RPC_ERRORS.invalid_params, z.prettifyError(params.error));
    }
    try {
      const result = await handler(params.data);
      this.#send({ jsonrpc: "2.0", id, result: result ?? null });
    } catch (err) {
      if (err instanceof RpcException) return this.#sendError(id, err.code, err.message, err.data);
      log.error("handler failed {method}", { method, error: err });
      this.#sendError(
        id,
        RPC_ERRORS.internal_error,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  #onNotification(message: object): void {
    const parsed = RpcNotification.safeParse(message);
    if (!parsed.success) {
      log.warning("invalid notification", { message });
      return;
    }
    const { method } = parsed.data;
    const listener = this.#listeners.get(method);
    const schema = Object.hasOwn(this.#local.notifications, method)
      ? this.#local.notifications[method]
      : undefined;
    if (!listener || !schema) {
      log.debug("unhandled notification {method}", { method });
      return;
    }
    const params = schema.safeParse(parsed.data.params);
    if (!params.success) {
      log.warning("invalid notification params {method}", { method, error: params.error });
      return;
    }
    try {
      listener(params.data);
    } catch (error) {
      log.error("listener failed {method}", { method, error });
    }
  }

  #onResponse(message: object): void {
    const parsed = RpcResponse.safeParse(message);
    if (!parsed.success) {
      log.warning("invalid response", { message });
      return;
    }
    const response = parsed.data;
    // Error responses with a null id answer a frame we could not parse.
    if (response.id === null) {
      log.warning("error from peer", { error: "error" in response ? response.error : null });
      return;
    }
    const pending = typeof response.id === "number" ? this.#pending.get(response.id) : undefined;
    if (!pending) {
      log.warning("response for unknown id {id}", { id: response.id });
      return;
    }
    this.#pending.delete(response.id as number);
    if ("error" in response) {
      pending.resolve({ ok: false, error: response.error });
      return;
    }
    const result = pending.result.safeParse(response.result);
    pending.resolve(
      result.success
        ? { ok: true, value: result.data }
        : {
            ok: false,
            error: { code: RPC_ERRORS.invalid_result, message: z.prettifyError(result.error) },
          },
    );
  }

  #onClosed(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const pending of this.#pending.values()) pending.resolve({ ok: false, error: CLOSED });
    this.#pending.clear();
    for (const listener of this.#closeListeners.splice(0)) listener();
  }
}
