import { z } from "zod";
import { CallRequest, Ctx } from "../schemas/call.ts";
import { UnknownEvent } from "../schemas/event.ts";
import { CallId, LogPosition, ThreadId } from "../schemas/names.ts";
import { defineApi } from "./peer.ts";

/** Chosen by the client, so events that arrive before the `subscribe` response still match. */
export const SubscriptionId = z.string().min(1);
export type SubscriptionId = z.infer<typeof SubscriptionId>;

export const SubscribeParams = z.object({
  subscriptionId: SubscriptionId,
  /** Inclusive. Absent: only new events. */
  from: LogPosition.optional(),
  /** When both filters are set, an event must match both. */
  rootId: CallId.optional(),
  threadId: ThreadId.optional(),
});
export type SubscribeParams = z.infer<typeof SubscribeParams>;

/** What the server handles. */
export const ServerApi = defineApi({
  methods: {
    /** Returns once `call.started` is journaled; `pos` is its position. */
    invoke: {
      params: CallRequest,
      result: z.object({ ctx: Ctx, pos: LogPosition }),
    },
    subscribe: { params: SubscribeParams, result: z.object({}) },
    unsubscribe: {
      params: z.object({ subscriptionId: SubscriptionId }),
      result: z.object({}),
    },
  },
  notifications: {},
});
export type ServerApi = typeof ServerApi;

/** What the client handles. */
export const ClientApi = defineApi({
  methods: {},
  notifications: {
    /** Unknown event kinds pass through; read them with `parseEvent`. */
    event: z.object({ subscriptionId: SubscriptionId, event: UnknownEvent }),
  },
});
export type ClientApi = typeof ClientApi;
