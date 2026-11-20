# Diagrams

Six diagrams of the FXRT model. They use the terms defined in design.md and share the conventions below, so a shape or a name means the same thing in every diagram.

## Conventions

**Shapes**

| Shape | Concept |
|---|---|
| Circle | A person (the principal in these examples) |
| Stadium (pill) | A client: the CLI, a phone |
| Rectangle, bold border | The server and its core: `invoke`, routing |
| Hexagon | An executor |
| Rounded rectangle | A call to an op |
| Double-edged rectangle | An agent |
| Diamond | A policy decision |
| Cylinder | The journal |
| Parallelogram | A region |
| Flag | An external service |
| Red rounded rectangle | An unchecked action (only in the "before" picture) |
| Grey box | A machine; a box inside a region box is a region inside a region |

**Placeholder names**

| Name | Role |
|---|---|
| you | The person using the system |
| mercury | Your laptop: runs the CLI, which is a client and an executor |
| mars | The machine that runs the FXRT server |
| jupiter | A Docker host, running the `jellyfin` container and media under `/srv/media` |
| saturn | A GPU box, used for builds and tests |
| venus | A NAS, used for backups |
| phone | A second interactive client |

Region names use the current `fs://`, `docker://` and `net://` schemes. "All of jupiter" stands for every region whose authority is jupiter; its syntax is not decided.

```mermaid
flowchart LR
  P(("person")):::person
  C(["client"]):::client
  S["server / core"]:::core
  E{{"executor"}}:::executor
  O("op call"):::op
  A[["agent"]]:::agent
  D{"policy"}:::policy
  J[("journal")]:::journal
  R[/"region"/]:::region
  X>"external service"]:::external
  U("unchecked action"):::danger

  classDef person fill:#fde68a,stroke:#92400e,color:#111
  classDef client fill:#bfdbfe,stroke:#1e40af,color:#111
  classDef core fill:#e5e7eb,stroke:#111827,stroke-width:3px,color:#111
  classDef executor fill:#bbf7d0,stroke:#166534,color:#111
  classDef op fill:#ffffff,stroke:#374151,color:#111
  classDef agent fill:#ddd6fe,stroke:#5b21b6,color:#111
  classDef policy fill:#fed7aa,stroke:#9a3412,color:#111
  classDef journal fill:#f5f5f4,stroke:#57534e,color:#111
  classDef region fill:#cffafe,stroke:#155e75,color:#111
  classDef external fill:#f3f4f6,stroke:#6b7280,stroke-dasharray:4 3,color:#111
  classDef danger fill:#fecaca,stroke:#b91c1c,color:#111
```

## 1. Topology

One server, executors on every machine, and clients wherever you are. Every executor and client opens its own connection out to the server, so no machine needs an open inbound port, and machines on different networks can join over a private network such as a tailnet. The CLI on mercury is one process in two roles: a client you type into, and an executor for mercury's files and shell.

```mermaid
flowchart LR
  YOU(("you")):::person

  subgraph mercury["mercury · laptop"]
    CLI(["CLI"]):::client
    EM{{"executor: mercury"}}:::executor
  end
  PH(["phone"]):::client

  subgraph mars["mars · server"]
    S["FXRT server<br/>invoke · policy · routing"]:::core
    J[("journal")]:::journal
  end

  subgraph jupiter["jupiter · Docker host"]
    EJ{{"executor: jupiter"}}:::executor
  end
  subgraph saturn["saturn · GPU box"]
    ES{{"executor: saturn"}}:::executor
  end
  subgraph venus["venus · NAS"]
    EV{{"executor: venus"}}:::executor
  end

  LLM>"model provider"]:::external

  YOU --- CLI
  YOU --- PH
  CLI -->|"connects out"| S
  PH -->|"connects out"| S
  EM -->|"connects out"| S
  EJ -->|"connects out"| S
  ES -->|"connects out"| S
  EV -->|"connects out"| S
  S --- J
  S -->|"model calls"| LLM

  classDef person fill:#fde68a,stroke:#92400e,color:#111
  classDef client fill:#bfdbfe,stroke:#1e40af,color:#111
  classDef core fill:#e5e7eb,stroke:#111827,stroke-width:3px,color:#111
  classDef executor fill:#bbf7d0,stroke:#166534,color:#111
  classDef journal fill:#f5f5f4,stroke:#57534e,color:#111
  classDef external fill:#f3f4f6,stroke:#6b7280,stroke-dasharray:4 3,color:#111
  style mercury fill:#fafafa,stroke:#9ca3af
  style mars fill:#fafafa,stroke:#9ca3af
  style jupiter fill:#fafafa,stroke:#9ca3af
  style saturn fill:#fafafa,stroke:#9ca3af
  style venus fill:#fafafa,stroke:#9ca3af
```

## 2. The life of one call

The agent decides Jellyfin needs a restart. The call goes through `invoke` like every other call: the core validates it, and policy decides on it using who chose it (the agent), whose authority it uses (you) and the region it writes. A write chosen by an agent gets an ask, so you approve it on your phone. The call is then routed by its region's authority to jupiter's executor, and the result comes back to the agent as a value. The journal records every step. A denial would also come back as a value: an error the agent can read.

```mermaid
flowchart TD
  A[["agent"]]:::agent
  I["invoke<br/>validates the call"]:::core
  P{"policy"}:::policy
  PH(["phone<br/>confirm: restart jellyfin?"]):::client
  R["route by authority"]:::core
  J[("journal")]:::journal

  subgraph jupiter["jupiter · Docker host"]
    E{{"executor: jupiter"}}:::executor
    O("docker.restart(jellyfin)"):::op
  end

  A -->|"1 · docker.restart(jellyfin)"| I
  I -->|"2 · actor: agent · principal: you<br/>writes docker://jupiter/jellyfin"| P
  P -->|"3 · ask"| PH
  PH -->|"4 · approved"| P
  P -->|"5 · allow"| R
  R -->|"6 · authority: jupiter"| E
  E -->|"7 · runs"| O
  O -->|"8 · result as a value"| A
  P -.->|"if denied: error as a value"| A
  I -.->|"records every step"| J

  classDef client fill:#bfdbfe,stroke:#1e40af,color:#111
  classDef core fill:#e5e7eb,stroke:#111827,stroke-width:3px,color:#111
  classDef executor fill:#bbf7d0,stroke:#166534,color:#111
  classDef op fill:#ffffff,stroke:#374151,color:#111
  classDef agent fill:#ddd6fe,stroke:#5b21b6,color:#111
  classDef policy fill:#fed7aa,stroke:#9a3412,color:#111
  classDef journal fill:#f5f5f4,stroke:#57534e,color:#111
  style jupiter fill:#fafafa,stroke:#9ca3af
```

## 3. Before and after

On the left is the usual setup today: the agent holds SSH keys and runs open shells, so any command on any host is possible, and nothing between the agent and the machine checks or records it. On the right, the agent holds no keys. It makes typed calls, policy checks each one, and the journal records them. Each executor holds its own host's credentials and enforces a local baseline, so even the server can't make a host do what its baseline forbids.

```mermaid
flowchart LR
  subgraph before["Before: an agent with SSH keys"]
    direction TB
    A1[["agent<br/>holds SSH keys"]]:::agent
    subgraph j1["jupiter"]
      SH1("open shell"):::danger
    end
    subgraph s1["saturn"]
      SH2("open shell"):::danger
    end
    A1 -->|"ssh · any command"| SH1
    A1 -->|"ssh · any command"| SH2
  end

  subgraph after["With FXRT"]
    direction TB
    A2[["agent<br/>holds no keys"]]:::agent
    I2["invoke"]:::core
    P2{"policy"}:::policy
    J2[("journal")]:::journal
    subgraph j2["jupiter"]
      E2{{"executor<br/>holds jupiter's credentials<br/>enforces its baseline"}}:::executor
    end
    subgraph s2["saturn"]
      E3{{"executor<br/>holds saturn's credentials<br/>enforces its baseline"}}:::executor
    end
    A2 -->|"docker.restart(jellyfin)"| I2
    I2 --> P2
    P2 -->|"allowed calls only"| E2
    P2 -->|"allowed calls only"| E3
    I2 -.->|"records"| J2
  end

  classDef core fill:#e5e7eb,stroke:#111827,stroke-width:3px,color:#111
  classDef executor fill:#bbf7d0,stroke:#166534,color:#111
  classDef agent fill:#ddd6fe,stroke:#5b21b6,color:#111
  classDef policy fill:#fed7aa,stroke:#9a3412,color:#111
  classDef journal fill:#f5f5f4,stroke:#57534e,color:#111
  classDef danger fill:#fecaca,stroke:#b91c1c,color:#111
  style j1 fill:#fafafa,stroke:#9ca3af
  style s1 fill:#fafafa,stroke:#9ca3af
  style j2 fill:#fafafa,stroke:#9ca3af
  style s2 fill:#fafafa,stroke:#9ca3af
```

## 4. Actor and principal

You tap a "nightly media check" button on your phone. It runs `media.check`, a fixed composition, so you are the actor for every call whose target was fixed in advance, including the call that starts the diagnosing agent. The agent then picks its own targets at runtime, so it becomes the actor for the calls it makes. The principal stays "you" through the whole tree: everything runs on your authority. Policy uses the actor to decide how strictly to check, and the principal to decide what is allowed at all.

```mermaid
flowchart TD
  YOU(("you")):::person
  BTN(["phone<br/>button: nightly media check"]):::client
  C1("media.check<br/>actor: you · principal: you"):::op
  C2("docker.list<br/>actor: you · principal: you"):::op
  AG[["agent: diagnose<br/>actor: you · principal: you"]]:::agent
  C3("docker.logs(jellyfin)<br/>actor: agent · principal: you"):::op
  C4("docker.restart(jellyfin)<br/>actor: agent · principal: you"):::op

  YOU -->|"taps"| BTN
  BTN --> C1
  C1 -->|"fixed target"| C2
  C1 -->|"fixed target"| AG
  AG -->|"picked at runtime"| C3
  AG -->|"picked at runtime"| C4

  classDef person fill:#fde68a,stroke:#92400e,color:#111
  classDef client fill:#bfdbfe,stroke:#1e40af,color:#111
  classDef op fill:#ffffff,stroke:#374151,color:#111
  classDef agent fill:#ddd6fe,stroke:#5b21b6,color:#111
```

## 5. Regions

Every op declares the regions it may read or write, and regions nest. `fs.read` touches one folder, and `docker.restart` touches one container. `shell.exec` can do anything on jupiter, so it declares all of jupiter, which contains both. Because policy compares regions, a deny on the Jellyfin container also catches `shell.exec`: its region overlaps the denied one, so the call is asked about rather than allowed. The narrower the op, the less it needs to ask.

```mermaid
flowchart LR
  subgraph ALL["all of jupiter"]
    subgraph SRV["fs://jupiter/srv"]
      MEDIA[/"fs://jupiter/srv/media"/]:::region
    end
    JF[/"docker://jupiter/jellyfin"/]:::region
  end

  RD("fs.read(/srv/media/…)"):::op
  RST("docker.restart(jellyfin)"):::op
  SHELL("shell.exec on jupiter"):::op
  DENY{"deny: write<br/>docker://jupiter/jellyfin"}:::policy

  RD -->|"declares"| MEDIA
  RST -->|"declares"| JF
  SHELL -->|"declares"| ALL
  DENY -.->|"blocks"| RST
  DENY -.->|"overlaps · ask"| SHELL

  classDef op fill:#ffffff,stroke:#374151,color:#111
  classDef policy fill:#fed7aa,stroke:#9a3412,color:#111
  classDef region fill:#cffafe,stroke:#155e75,color:#111
  style ALL fill:#ecfeff,stroke:#155e75
  style SRV fill:#cffafe,stroke:#155e75
```

## 6. Network rules in three layers

A build on saturn runs `npm install`. The network the call may reach is the intersection of three layers: what the op declares, what you have granted, and saturn's own baseline. The executor computes it and enforces it with an egress filter, so the npm registry is reachable and github.com, declared but never granted, is blocked. Grants live on the server and you can change them. The baseline lives on saturn, and the server can't widen it, so a compromised server still can't open what the host forbids.

```mermaid
flowchart LR
  D[/"op declares<br/>net://registry.npmjs.org<br/>net://github.com"/]:::region

  subgraph mars["mars · server"]
    G[/"you granted<br/>net://registry.npmjs.org"/]:::region
  end

  subgraph saturn["saturn · GPU box"]
    B[/"saturn's baseline<br/>anything except the<br/>management network"/]:::region
    X{"intersection"}:::policy
    E{{"executor: saturn<br/>egress filter"}}:::executor
  end

  OK>"npm registry: allowed"]:::external
  NO>"github.com: blocked"]:::external

  D --> X
  G --> X
  B --> X
  X --> E
  E --> OK
  E --x NO

  classDef executor fill:#bbf7d0,stroke:#166534,color:#111
  classDef policy fill:#fed7aa,stroke:#9a3412,color:#111
  classDef region fill:#cffafe,stroke:#155e75,color:#111
  classDef external fill:#f3f4f6,stroke:#6b7280,stroke-dasharray:4 3,color:#111
  style mars fill:#fafafa,stroke:#9ca3af
  style saturn fill:#fafafa,stroke:#9ca3af
```
