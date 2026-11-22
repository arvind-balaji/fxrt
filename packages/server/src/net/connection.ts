import {
  ClientApi,
  Peer,
  RPC_ERRORS,
  RpcException,
  ServerApi,
  type Socket,
  type SubscribeParams,
  type SubscriptionId,
} from "@fxrt/protocol";
import { getLogger } from "@logtape/logtape";
import type { Core } from "../core/core.ts";

const log = getLogger(["fxrt", "net"]);

/**
 * One client connection: serves ServerApi on top of the core. Subscriptions
 * belong to the connection and end with it. Calls it invoked keep running.
 */
export class Connection {
  readonly #core: Core;
  readonly #peer: Peer<ServerApi, ClientApi>;
  readonly #subscriptions = new Map<SubscriptionId, AbortController>();

  constructor(core: Core, socket: Socket) {
    this.#core = core;
    this.#peer = new Peer(socket, { local: ServerApi, remote: ClientApi });
    this.#peer.handle("invoke", (req) => {
      const call = core.invoke(req);
      return { ctx: call.ctx, pos: call.pos };
    });
    this.#peer.handle("subscribe", (params) => this.#subscribe(params));
    this.#peer.handle("unsubscribe", ({ subscriptionId }) => {
      this.#subscriptions.get(subscriptionId)?.abort();
      this.#subscriptions.delete(subscriptionId);
      return {};
    });
    this.#peer.onClose(() => {
      for (const ctl of this.#subscriptions.values()) ctl.abort();
      this.#subscriptions.clear();
    });
  }

  get subscriptionCount(): number {
    return this.#subscriptions.size;
  }

  close(): void {
    this.#peer.close();
  }

  #subscribe(params: SubscribeParams): Record<string, never> {
    const { subscriptionId } = params;
    if (this.#subscriptions.has(subscriptionId)) {
      throw new RpcException(
        RPC_ERRORS.invalid_params,
        `subscription already exists: ${subscriptionId}`,
      );
    }
    const ctl = new AbortController();
    this.#subscriptions.set(subscriptionId, ctl);
    void this.#forward(params, ctl.signal);
    return {};
  }

  async #forward(params: SubscribeParams, signal: AbortSignal): Promise<void> {
    const { subscriptionId, from, rootId, threadId } = params;
    try {
      // No backpressure yet: a large backlog goes out as fast as the core reads it.
      for await (const event of this.#core.subscribe(from, { signal })) {
        if (rootId !== undefined && event.rootId !== rootId) continue;
        if (threadId !== undefined && event.threadId !== threadId) continue;
        this.#peer.notify("event", { subscriptionId, event });
      }
    } catch (error) {
      log.error("subscription failed {subscriptionId}", { subscriptionId, error });
    }
  }
}
