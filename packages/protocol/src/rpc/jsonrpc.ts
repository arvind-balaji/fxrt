import { z } from "zod";

// JSON-RPC 2.0 envelopes. https://www.jsonrpc.org/specification

export const RpcId = z.union([z.number().int(), z.string()]);
export type RpcId = z.infer<typeof RpcId>;

export const RpcRequest = z.object({
  jsonrpc: z.literal("2.0"),
  id: RpcId,
  method: z.string().min(1),
  params: z.unknown().optional(),
});
export type RpcRequest = z.infer<typeof RpcRequest>;

export const RpcNotification = RpcRequest.omit({ id: true });
export type RpcNotification = z.infer<typeof RpcNotification>;

export const RpcError = z.object({
  code: z.number().int(),
  message: z.string(),
  data: z.unknown().optional(),
});
export type RpcError = z.infer<typeof RpcError>;

export const RpcResponse = z.union([
  z.object({ jsonrpc: z.literal("2.0"), id: RpcId.nullable(), result: z.unknown() }),
  z.object({ jsonrpc: z.literal("2.0"), id: RpcId.nullable(), error: RpcError }),
]);
export type RpcResponse = z.infer<typeof RpcResponse>;

/** The standard codes, plus two of ours from the implementation-defined range. */
export const RPC_ERRORS = {
  parse_error: -32700,
  invalid_request: -32600,
  method_not_found: -32601,
  invalid_params: -32602,
  internal_error: -32603,
  /** The connection closed before the response arrived. */
  connection_closed: -32000,
  /** The response does not match the method's result schema. */
  invalid_result: -32001,
} as const;

export type RpcResult<T> = { ok: true; value: T } | { ok: false; error: RpcError };

/** Throw from a handler to send a specific error code. Other throws send internal_error. */
export class RpcException extends Error {
  override name = "RpcException";
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
  }
}
