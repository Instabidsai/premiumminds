# Research + Cross-Check: Worked Example

> The first real run of the pattern. Evaluates 4 GitHub projects for adding a graph layer to our memory system. Shows what verified-vs-claimed looks like, how the cross-check against beliefs works, and how the verdict gets assigned. Use this as your model for what "good" looks like before running your own first time.

---

## Subject (the input)

> "Look into obsidian-nexus and graphify on GitHub — look into this for adding to our memory layer. How would it change really? Deeply research this, it may be a big jump."

Multi-input format: 4 GitHub projects evaluated as candidates for adding a graph relationship layer on top of our existing pgvector-based memory system.

The candidates:
1. `obra/knowledge-graph` — 59 stars, 2-day weekend project
2. `safishamsi/graphify` — 19.9K stars, 7 days old
3. `drewburchfield/obsidian-graph` — 10 stars, 1 contributor
4. `Jallermax/knowledge-nexus` — 23 stars, dormant since Dec 2024

---

## Round 1 (the failure mode this pattern exists to prevent)

**First-pass research**: an agent skimmed the READMEs, the feature lists, and the star counts. Came back with a glowing summary: *"Louvain clustering, PageRank, 10 query types, full knowledge graph."* Sounded amazing.

**That was wrong.** Every word was technically present somewhere in the project marketing. None of it was source-verified.

This is the failure mode. The agent did exactly what AI agents default to doing — it parroted plausible-sounding claims. It would have led to a wasted week of integration before discovering the projects were not what they appeared.

---

## Round 2 — actual deep research (the cross-check pattern)

Four parallel agents dispatched, each told: *read the actual .py and .ts files, cite file paths and line numbers, count actual implementations, verify the marketing claims*.

### Source verification per project

#### `obra/knowledge-graph` — algorithms ARE real

| Claim | Verified? | Evidence |
|---|---|---|
| Louvain community detection | YES | `graph.ts` ~250 lines, real graphology integration |
| PageRank centrality | YES | Cited in graph.ts |
| Betweenness centrality | YES | 60+ real tests |
| MCP server integration | PARTIAL | Zod v4 crash blocks tool auto-discovery — known bug |

**Honest assessment**: 26 commits over 2 days, 1 contributor, weekend project. Algorithms are real but the integration is fragile. Don't adopt the project; lift the algorithm pattern.

#### `safishamsi/graphify` — well-built but wrong domain

| Claim | Verified? | Evidence |
|---|---|---|
| Leiden community detection | YES | `cluster.py` ~100 lines |
| AST extraction for 21 languages | YES | `build.py` ~50 lines |
| 71.5x token reduction | MISLEADING | The 71.5x claim compares against pasting your entire codebase — a straw man nobody does |
| Semantic extraction | FALSE | Outsourced to Claude subagent prompts; no Python code for it |
| Embedding-based query | FALSE | Query system is basic keyword matching |

**Honest assessment**: 126 commits, 7 days old, viral hype cycle, only 1 real contributor. Code is genuinely good for what it does (codebase comprehension via AST). Wrong tool for our memory layer — designed for code, not knowledge.

#### `drewburchfield/obsidian-graph` — not a graph at all

| Claim | Verified? | Evidence |
|---|---|---|
| "Knowledge graph" | FALSE | It's pgvector + BFS over cosine similarity. Zero graph algorithms. |
| Centrality / clustering | FALSE | Not present in any file |
| Materialized connection_count for hubs | YES | Useful pattern even though the rest is misleading |

**Honest assessment**: We already have pgvector. Skip entirely. Only useful artifact is the materialized connection-count pattern.

#### `Jallermax/knowledge-nexus` — dead code

| Claim | Verified? | Evidence |
|---|---|---|
| AI agent pipeline | FALSE | 4 of 6 agent files are 0 BYTES. Empty files. |
| Entity extraction | DEAD | Function exists but is never called in the pipeline |
| "GraphRAG" | MISLEADING | It's a Notion document indexer with 2-hop Cypher queries |

**Honest assessment**: Last real code Dec 2024. Do not touch. If we ever want real GraphRAG, use Microsoft's actual `graphrag` library.

---

## Cross-check against our stack

### 1. Already have something like this?

| Capability | Our stack | Closest match in candidates |
|---|---|---|
| Vector embeddings | pgvector in Hive Brain Supabase | obsidian-graph (already have it, no need) |
| Similarity search | `search_justin_memory` RPC | All 4 (we already do this) |
| Graph traversal / centrality | NONE | obra/knowledge-graph algorithms |
| Cluster detection | NONE | graphify (Leiden) or obra (Louvain) |
| Bridge detection | NONE | None of them ship this directly |

**Key finding**: we have the storage and similarity layer covered. We're missing the graph algorithms layer entirely. None of the 4 projects ship a drop-in solution for our specific gap.

### 2. Beliefs touched

(From `justin_mental_model`, 24 active beliefs)

**REINFORCED:**
- *"Check the library before you build"* — checked 4 libraries, found 2 useful pattern donors and 2 to skip. Without checking, we would have rebuilt from scratch.
- *"Data dominates. Smart data structures..."* — adding an edges table is a smart-data-structure move, not a smart-code move.
- *"Context infrastructure over prompts"* — graph traversal IS context infrastructure.
- *"Compound everything"* — edges accumulate; the longer the system runs, the smarter the graph gets.

**TENSIONS:**
- *"Revenue is the ground truth"* — the graph layer produces knowledge improvements, not direct Stripe dollars. Needs a revenue path before building.

**No CONTRADICTIONS surfaced.**

### 3. Prior attempts

Searched memory for prior attempts at graph databases / knowledge graphs:
- We use **Graphiti** in PremiumMinds (Neo4j + Graphiti FastAPI). That IS a temporal knowledge graph. We already have one for community knowledge.
- We do NOT have one for the Hive Brain (cross-company intelligence layer).

So this isn't new territory — we've validated that temporal graphs work for one use case (PremiumMinds community memory). The question is whether to extend the same pattern to Hive Brain or build a different layer.

### 4. Adoption deltas

If we adopt the recommended hybrid (Supabase edges table + Python networkx + graspologic):

- **New table**: `knowledge_edges` in Hive Brain Supabase
- **Modified RPC**: `cross_reference_insight` becomes edge-creating, not just edge-finding
- **New Python script**: `graph_recompute.py` runs on a heartbeat, builds in-memory networkx graph, runs Leiden + PageRank + betweenness + bridges, writes results back to Supabase
- **Modified skills**: `/reflect` and `/belief-check` consume the new graph queries
- **Cost**: ~30MB networkx + ~100MB graspologic in the worker environment. ~1 day build. No ongoing cost beyond compute time on each recompute.

### 5. Verdict

**HYBRID** — Supabase edges table (our DB, our auth, no data duplication) + networkx/graspologic Python algorithms (mature libraries, real Leiden/PageRank/betweenness, not SQL approximations). **No single project does what we need without either duplicating our data to a second store or being designed for the wrong domain.** The hybrid is the only path that gives us real algorithms without architectural complexity.

**Conditional**: must clear the revenue gate (from the "Revenue is the ground truth" belief at 1.0 confidence) before building. Without a revenue path, this is a learning loop and the belief blocks the build.

---

## What I'd change if I adopted this

- Add `knowledge_edges` table to Hive Brain (`wdvfwtecvdhtvmyeymgy`)
- Modify `cross_reference_insight` RPC to also write edges
- Build `graph_recompute.py` as a new Python worker (~100 lines)
- Update `/reflect` Phase 4 to use `find_bridges()` instead of brute-force pair comparison
- Update `/belief-check` to add centrality analysis (orphan beliefs flagged for retirement, hub beliefs flagged as structural risks)
- Update `/justin` startup ritual to show "N nodes, M edges, K communities" alongside the existing observations

---

## Provenance

- **obra/knowledge-graph**: read `graph.ts` (algorithm wrapper), `package.json` (dependencies confirm graphology), test files (60+ tests). Commit head as of Apr 10 2026.
- **safishamsi/graphify**: read `build.py` (50 lines), `cluster.py` (100 lines), `analyze.py` (400 lines). Confirmed Leiden integration in cluster.py. Confirmed semantic extraction is delegated to Claude subagent prompts (no Python implementation).
- **drewburchfield/obsidian-graph**: read main module, confirmed no graph algorithm imports, only pgvector cosine BFS.
- **Jallermax/knowledge-nexus**: file size check confirmed 4 of 6 agent files at 0 bytes. `git log` confirmed no commits since Dec 2024.
- **Cross-check sources**: queried `justin_mental_model` (24 active beliefs), `justin_memory` (339 memories), our existing Graphiti deployment in PremiumMinds.

---

## Honest gaps

- Did NOT test graphology or networkx + graspologic against our actual 339-memory dataset. Performance is theoretical until we run it.
- Did NOT check Microsoft's `graphrag` library deeply — flagged as a future option if Path 1 (networkx) hits limits.
- Did NOT verify the Zod v4 fix for obra/knowledge-graph; the bug may already be patched in a fork.
- Revenue path is unknown. Belief check flagged this as the only blocker.

---

## What this example demonstrates

1. **First-pass research is always optimistic.** The Round 1 summary called the projects "amazing." Round 2 (source-verified) found 2 of 4 were broken or misleading.
2. **The cross-check against OUR stack is what made the verdict useful.** Without it, the answer would have been "graphify is interesting." With it, the answer was "graphify is interesting BUT designed for codebases not knowledge, AND we already have Graphiti in production for one use case, AND the actual hybrid we want is networkx + Supabase, AND we can't build it until we close the revenue belief."
3. **Provenance enforcement caught the bullshit.** "I read graph.ts and confirmed graphology integration" is provable. "Louvain clustering" alone is not.
4. **Honest gaps beat false confidence.** Flagging "did not test against our dataset" is more useful than claiming "this will scale fine."

This is the model. Run yours the same way.
