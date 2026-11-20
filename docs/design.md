# FXRT - An execution engine for composable operations

**Working vocabulary.** We use these terms internally for development.
These terms can change, and they probably will change.
The Concepts section explains each term.
- **Operation (op):** a function that has types and declared effects.
  All callable things are ops.
- **Actor:** the entity that chose the target of a call.
  An actor can be an agent, code, a person who uses an interactive client, or a schedule.
- **Principal:** the person or schedule whose authority a call uses.
- **Executor:** a process that runs primitive ops.
  Examples are the server and the CLI.
- **Region:** a named place that an op reads or writes.
  Examples are `fs://mercury/Users/dev/proj`, `net://api.github.com` and `self://journal`.
- **Thread:** a stable ID that connects a sequence of agent runs into one continuous line of work.
- **Surface:** a declarative UI that a client renders.
  A surface contains a component tree, a data model, and actions.

**Short-term goal.** The goal is a terminal coding agent that completes the same real tasks as the leading coding agents, with the same model.
Evals measure this goal.

**Long-term vision.** We want a living ecosystem of capabilities.
In this ecosystem, the type of caller is not important.
The caller can be an agent, code, or a person who clicks a button.
You select and manage the capabilities that exist, and the system connects them.
- The harness uses the same parts that it gives to you.
  One extension mechanism replaces hooks, skills, plugins, slash commands, and subagents.
  Hooks are not in scope now.
- You can replace any part in each workspace, without a fork.
  Examples are compaction, memory, and permissions.
  This feature is for a later phase.
  Policy bindings come only from user scopes or trusted scopes.
  Thus, a cloned repository cannot make policy weaker.
- Parts also operate outside the agent loop.
  A button can run compaction.
  A dashboard can query the catalogue.
  A cron job gets the same policy as an agent.
- Interfaces are data.
  The system derives forms and views from the schema of each function.
  The system can also generate custom interfaces on top of these forms and views.
  Each connected client renders them.
- The agent can write a new capability.
  After you approve the capability, the agent can use it on its next turn.
  Before this feature, we must have a sandbox (see Security model).
- The journal records all calls and events.
  Thus, the system can resume, replay, evaluate, and calculate the cost of runs.

**Principles.**
- There is one kind of thing.
  All callable things are ops.
- Only ops contain behaviour.
  The core is the one exception, and the core must stay small.
  The core contains `invoke`, the registry, the journal, the transport, and policy.
  Wiring is data that points to ops.
  Wiring includes overrides, hook installs, triggers, and surface actions.
- Each call goes through one `invoke`.
  `invoke` validates the call, checks policy, records the call in the journal, and streams the events.
- An append-only journal records each call and each event.
  The transcript, resume, and cost all come from this journal.
- Agent quality decides success.
  We run smoke evals from the first agent that works.
  Then we run benchmarks against the leading coding agents on the same model.

**Leanings.** We prefer these design rules, but they are not fixed.
If a different rule works better, change the rule.
The Concepts section explains the effect of each rule.
- Errors are values that go back to the caller.
  Errors are not exceptions.
- Ops are deterministic over the recorded data.
  The behaviour of an op depends only on its input, the results of its child calls, and its declared regions.
  An op never reads the actor, the principal, the client, or other ambient state.
  Time and random values come through calls or through input.
  Thus, the journal records them.
- Ops never make events.
  Ops return chunks and results.
  The core makes the events for each call.
- Clients render, but they do not make decisions.
  The server keeps the state that clients show.
  The CLI is the first client, but it is not a special case.
- UI is data.
  Interactions and surfaces are typed requests.
  Each client renders them in its own way.
  If a client does not know a component, it shows that component as plain output.
  It does not show an error.
- Declare effects, and derive purity.
  Ops declare regions.
  The defaults are the strictest values.
  Ops do not have a `pure` field.
- Enforce rules where the truth is.
  The executor finds the true region and enforces its bounds.
  The op does not do these tasks.
- Policy only makes a decision: allow, deny, or ask.
  Policy never changes a call.
- A disconnect is an event.
  A disconnect is not a cancellation.
- Use the word "call".
  Do not use the word "tool".

**Concepts.** This section shows how the parts connect.
Like the leanings, we prefer these concepts, but they are not fixed.

**1. Ops and calls.**
- **Ops:** an op has these properties: an input schema, an output schema, a description, declared effect regions (`reads`, `writes`), `idempotent`, and `requires`.
  `requires` lists the ops that the op can call.
  An executor implements a primitive op.
  A compound op calls other ops to do its work.
  An agent is an op that calls `lm` in a loop and calls other ops.
- **Shape of `invoke`:** `invoke` takes one structured call, `invoke(call)`, and returns a stream of events.
  A call is `{ target, input, ctx? }`.
  The target is an abstract reference: a name, a hash, or a selector.
  Now, `ctx` contains the call ID, the parent ID, the root ID, the actor, and the principal.
  A child call carries the IDs and the principal of its parent.
  The core sets the actor of the child call (see Security model).
- **Cancellation:** cancellation is a protocol message, `cancel(callId)`.
  Cancellation is not a `ctx` field.
  The cancellation goes to all children of the call through their parent IDs.
- **Errors and streams:** an error is a value that goes back to the caller.
  Each error has a code and a message.
  Examples of codes are `invalid_input`, `denied`, `no_executor`, `timeout`, `cancelled`, and `interrupted`.
  These codes are only examples, and the set is not fixed.
  A streaming op returns a final result that matches its output schema.
  Each chunk goes in a `call progress` event.
  The content of a chunk does not have a schema.
- **Naming:** op names are plain, for example `lm` and `fs.read`.
  Op names have no `op:` prefix.
  We did not decide the naming rules.
  Events and documents use the word "call", not "tool".
  The word "tool" occurs only in the `lm` adapter.
  In that adapter, ops become tool definitions.

**2. Clients and executors.**
- **Roles:** a client is a program that connects to the server to make calls and to receive results.
  Examples are the CLI, scripts, and the eval runner.
  An executor runs primitive ops.
  The server runs `lm`.
  The CLI runs file ops and shell ops on its machine.
  Later, a browser can also run ops.
- **Authorities:** an executor registers the authorities that it serves.
  Usually, an executor serves only its own machine.
  But an executor can serve more than one authority.
  For example, a CLI can be a proxy for a remote machine through SSH.
  Client and executor are roles, not types of process.
  One process can be a client and an executor at the same time.
  An interactive client is a client that also provides the interaction ops.
- **Wire:** each process has one connection to the server.
  The process can make calls and serve calls on that connection.
  A call has the same shape in the two directions: from client to server, and from server to executor.
  An op is available only while a connection serves it.
  Each client has a stable identity.
  The server uses this identity to recognise an executor when it connects again.
- **Lost connections:** when a connection is lost, the server records a `connection lost` event.
  Then the server ends each call in progress on that connection with `interrupted`.
  All connections that subscribe to the root or the thread of a call can cancel that call.
  The cancellation then goes to all children of that call.
- **Routing:** the server sends each host-local call to the executor that is registered for the authority of the call's region.
  The client that sent the prompt does not change this.
  For example, a call that touches `fs://mercury/Users/dev/proj/src/a.ts` goes to the executor that is registered as `mercury`.
  The model call runs on the server.
- **Relative paths:** the system resolves relative paths against a default location.
  Now, this location is the working directory of the CLI.
  For a later phase, the source of the default is open.
  Examples of possible sources are the prompt, the thread, and an explicit choice.
- **Attach and disconnect:** a client attaches when it subscribes to the root call or to the thread.
  If you close your laptop, the calls in progress on it finish with `interrupted`.
  The ops of the laptop become unavailable.
  But the disconnect does not cancel the run.
  The run receives the `interrupted` results as values.
  The run stops by itself when it is blocked or when it reaches its limits.
  If the executor connects again and registers again, its ops become available again.
- **Threads:** the server creates a thread at the first root call.
  In each thread, only one root call can run at a time.
  We will decide later how more than one interactive client shares a run.

**3. Events and the journal.**
- **Events:** an event is a typed record.
  The server adds each event one time to a single append-only log.
  The server also streams each event to the subscribed clients.
  All that a client shows comes from typed events or from interaction requests.
  Both are data.
  Each event carries the IDs of its call and a position in the one global log.
  Thus, a client can subscribe from a given position, and filter by root call or by thread.
- **Views:** there is one log, but there are many views of it.
  A call's stream, a root call's feed, a thread's feed, and a client subscription are all views of the log.
  The call record is a summary that the system derives from the `call started` and `call finished` events.
  The core makes a `call started` event when a call starts.
  The core wraps each chunk of an op in a `call progress` event, and the final result in a `call finished` event.
  The text deltas from the model are progress chunks.
- **Journal:** the journal is the event log and a calls table.
  The system derives the calls table from the log.
  The calls table has one row for each call.
  Each row records the actor, the target, the principal, the input, the result, the declared regions, and the regions that the call touched.
  The resume function reads the calls table.
  The journal records the full input and the full output of each effectful call.
  For `lm`, the journal records the full request and the full response.
- **Transcript:** the system derives the transcript of a thread from the journal.
  The transcript is the latest compaction result and all entries after it.
  The journal records each compaction call with the log position that it covers.
  The full history stays in the log.
- **Resume and replay:** replay as a feature is only a design model.
  It does not exist yet.
  Replay gives the recorded results back to the ops and calculates the pure logic again.

**4. Security model.**
- **Actor:** the actor is the entity that chose the target.
  For example, a person clicks a button.
  The button runs a fixed composition of ops.
  The person is the actor for each call in the composition.
  This is because the author of the composition fixed the targets before the run.
  The composition can include an agent.
  The agent selects its targets at runtime.
  Thus, the agent becomes the actor for the calls that it makes.
  The core sets the actor.
  Ops never read the actor.
- **Principal:** the principal is the entity whose authority the call uses.
  The principal stays the same through each nested call.
  A schedule acts for the person who made it.
  Policy reads the actor and the principal.
  The actor sets the strictness of policy.
  The principal sets the limits of what policy allows.
- **Effect regions:** an op declares `reads` and `writes`.
  Each is a list of region patterns.
  The default is `*`, which is the strictest value.
  An op also declares `idempotent`, and the default is false.
  A region is a hierarchical name with an authority.
  The scheme tells the type of place and its authority.
  For files, the authority is the host.
  For the network, the authority is the remote domain.
  For the state of the server, the authority is the server.
  A region contains another region if its path is a parent of the path of the other region, segment by segment.
- **Purity:** an op is pure in two cases.
  In the first case, the op declares empty lists.
  In the second case, the op reads only immutable (pinned) regions.
  There is no read, write, or external class.
  A compound op does not need a calculated class.
  Policy checks each call separately.
- **Region information over time:** region information exists at more than one point in the life of a call.
  For example:
  - the regions that the op declares
  - the regions that this call will touch (policy makes its decision on these regions)
  - the regions that the executor reports that the call touched
  - the regions that a run or a thread touched over time

  These points are only examples.
  They are not a specification.
  The permissions work must also enforce `requires`.
  This includes each op that a call can reach through `requires`.
  The actor rule depends on this enforcement.
- **Policy:** `invoke` calls policy at one fixed point.
  `invoke` calls policy directly, not through `invoke`.
  Policy is the implementation that is bound at that time (see Long-term vision).
  Hooks are not in scope now.
- **Approvals:** when policy returns `ask`, the core calls `confirm` on an interactive client for policy.
  Sometimes no interactive client can answer.
  For example, no client is connected, or the connection was lost.
  In this case, the result of `ask` is `deny`.
  We will decide later which client gets the request when more than one client is connected.
- **Trust boundaries:** the server and the CLI can run on different machines.
  This is a core feature.
  Thus, the server never trusts the network.
  Policy applies only to calls that go through `invoke`.
  Thus, op code that runs outside a sandbox can bypass policy.
- **Sandbox:** we must have a sandbox before an agent can write a capability and use it on its next turn.
  A hash refers to a specific version of an op.

**5. Interfaces.**
- **Three ways to call:** agents call ops through tool definitions.
  Code calls ops through `invoke`.
  People call ops through interaction requests and surfaces.
- **Interaction is data:** an interactive client provides the interaction ops.
  Each of these ops has a typed result.
  Now, the interaction ops are these:
  - `ask` asks a question with options or with free text.
  - `confirm` asks for approval. It shows what the call will touch and what the call will do.
  - `form` shows fields from a JSON Schema.

  The CLI renders these requests as prompts.
  Later, a graphical client will render the same request in its own way.
  The `interaction request` event is the wire form of the pending call.
  The journal records these calls.
  If no client provides an interaction op, the system does not give that op to the agent.
- **Surfaces:** a surface has a component tree, a data model, and actions.
  The actions send events back to the server.
  Surfaces use the style of A2UI.
  A client declares what it can render.
  Surfaces contain only UI.
  Surface updates have their own event kind.
  Model text is not a surface.
  Call events are not surfaces.
