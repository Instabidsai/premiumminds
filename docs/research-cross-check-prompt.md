# Research + Cross-Check Prompt

> A "PR review for an idea." Copy the prompt below into any AI agent (Claude Code, Cursor, Zed, ChatGPT, a Python session running Claude or GPT). Customize the **MY KNOWLEDGE BASE** section with your own context. Run it on anything you want to evaluate against your own stack.

---

## Why this exists

PremiumMinds operates on a 3-step pattern, not a 2-step pattern:

```
1. INPUT          → a member drops something (link, video, repo, idea, observation)
2. DEEP RESEARCH  → an agent reads the actual artifacts, not the README
3. CROSS-CHECK    → the findings get compared against MY specific knowledge,
                    not against the generic internet
4. OUTPUT         → a structured report posted back to the channel
```

The third step is the differentiator. Without it, you get a generic AI summary that sounds plausible. With it, you get a contextualized verdict that answers *"how does this compare to what I already do, and would I change anything because of it."*

This is the discipline the group runs on. Use it for every meaningful tool, paper, video, or idea you evaluate.

---

## Hard rules (the failure modes this prompt prevents)

1. **No README parroting.** README claims and feature lists are not evidence. If you cannot show a file path and a line number where a claimed feature is implemented, the claim is unverified.
2. **No star-count summaries.** Stars do not mean the project works. Read the code.
3. **No marketing claims passed through.** Headline metrics like "10x faster" or "71x token reduction" need a methodology check. What's the comparison? Is it a straw man?
4. **No skipped cross-check phase.** Skipping the cross-check is the exact failure this prompt exists to prevent. The whole point is to compare against your stack, not produce a standalone summary.
5. **Honest gaps over false confidence.** "I could not verify this" is a valid answer. "It looked good to me" is not.

---

## The prompt — copy from here

```
You are doing a Research + Cross-Check for me. This is a "PR review for an idea."
Read the SUBJECT below, deeply research it, then cross-check the findings against
MY KNOWLEDGE BASE. Output a structured report in the EXACT format at the bottom.

## SUBJECT
[paste a URL, repo path, idea, paper, video link, or "what if we..." thought here]

## HARD RULES (non-negotiable)
1. NO README parroting. NO star-count summaries. NO marketing claims passed through.
2. If the SUBJECT is a GitHub repo, you must read actual source files and cite
   file paths + line numbers. If you cannot show the line number, the claim is
   unverified — say so.
3. If the SUBJECT is a video, pull the actual transcript. Do not guess from the title.
4. If the SUBJECT is a paper, read the abstract AND at least one body section.
5. If the SUBJECT is a "what if" idea, find at least 2 actual implementations of
   the closest existing approach and compare.
6. After the research phase, you MUST do the cross-check phase. Skipping it is
   the failure mode this entire prompt exists to prevent.
7. "I could not verify this" is a valid answer. False confidence is not.

## DEEP RESEARCH PHASE
For the SUBJECT, produce:
- Claimed features → with the source of each claim (which file or which paragraph)
- Verified features → file path + line number, or transcript segment, or paper section
- Unverified claims → flag honestly
- False or misleading claims → say so plainly with evidence
- 3-sentence summary of what the thing actually IS (not what the README says it is)

## MY KNOWLEDGE BASE
(Customize this section with your own context. Be specific. The more accurate
this is, the better the cross-check works.)

- My active beliefs / operating principles:
  [paste your beliefs as a list, or paste the path to a file containing them]

- My existing stack:
  [languages, frameworks, services, AI models, key libraries you currently use]

- My codebases (paths the agent can read):
  [list directories: ~/myproject1, ~/myproject2, etc.]

- My prior failures / lessons learned:
  [things you've already tried that didn't work, and why]

- My current goals:
  [what you're trying to accomplish RIGHT NOW that this thing might help with]

- My existing tools catalog (optional):
  [tools/MCP servers/skills you already have. If you don't have a catalog yet,
  skip this — but consider building one.]

## CROSS-CHECK PHASE (do not skip)
Compare the verified findings against MY KNOWLEDGE BASE. Answer all 5 questions:

1. Do I already have something like this in my stack? Where? How does it compare?
   (Be specific. "We use X for the same purpose at /path/to/file.py:42")
2. Which of my beliefs does this reinforce, tension, or contradict? Be specific.
   ("Reinforces belief #3 about X because Y. Tensions belief #7 about Z because W.")
3. Have I tried something like this before? What happened? Search my failures log.
4. If I adopted this, what would change in my code or process? Be concrete.
   (Files I'd modify, processes I'd revise, costs I'd incur, gains I'd realize.)
5. Verdict: one of [raid / build / hybrid / watch / skip] — and one sentence why.

## OUTPUT FORMAT (use this exact structure)

# Research + Cross-Check: [subject name]

## What it actually is
[3-sentence summary based on verified evidence, not README claims]

## Source verification
**Claimed:** [list of feature claims from the SUBJECT, with where each claim is sourced]
**Verified:** [file path + line number for each verified feature]
**Unverified:** [claims you couldn't check]
**False or misleading:** [claims that don't match the code, with evidence]

## Cross-check against my stack
1. **Already have something like this?** [yes/no, what, where, how it compares]
2. **Beliefs touched:** [reinforces / tensions / contradicts which beliefs and why]
3. **Prior attempts:** [have I tried this before? what happened?]
4. **Adoption deltas:** [concrete changes to code or process if I adopted this]
5. **Verdict:** [raid / build / hybrid / watch / skip] — [one sentence why]

## What I'd change if I adopted this
[bullet list of concrete deltas — file paths, process changes, costs]

## Provenance
- Files read: [path:line for each]
- Commit SHA (for repos): [sha]
- Transcript ID (for videos): [id]
- Paper section (for papers): [section name + page]
- Timestamps: [when this research was done]

## Honest gaps
[what you couldn't verify, what you didn't have access to, what would need a deeper pass]
```

---

## Three ways to actually use this

### Way 1 — Member with Claude Code

Install the sister skill `/cross-check` (we publish it from PremiumMinds). Fill in your knowledge base file once at `~/.cross-check-knowledge.md`. From any Claude Code session: `/cross-check <thing>`. Done.

### Way 2 — Member with any AI chat (no Claude Code required)

Copy the prompt above. Paste into ChatGPT, Claude.ai, Cursor chat, Zed AI, or any agent that can read URLs and write structured output. Customize the **MY KNOWLEDGE BASE** section. Paste your subject. Run it.

### Way 3 — Member with no setup

Drop the thing in PremiumMinds chat. Tag the operator (or just post in `#mcp-oss-intel` / `#meta-architecture`). The PremiumMinds operator runs OUR version against OUR knowledge base and posts findings back as a reply. You get the *output* without doing the work yourself. Caveat: the cross-check is against OUR stack, not yours — good for "is this real?" questions, less good for "should I personally adopt it?"

---

## What "good" looks like — see the worked example

The first real run of this pattern is documented at `docs/research-cross-check-EXAMPLE.md`. It evaluates 4 graph-knowledge-base projects (obra/knowledge-graph, graphify, obsidian-graph, knowledge-nexus) and shows what verified-vs-claimed looks like, how the cross-check against beliefs works, and how the verdict gets assigned. Read it before running your own first time.

---

## Why this matters more than it sounds

The default behavior of AI agents reading GitHub is to parrot the README. The default behavior reading a YouTube video is to summarize the title. Neither produces truth. The only reliable pattern is: **dispatch agents to read the actual artifacts, force them to cite file paths and line numbers, then cross-check against what you actually use.**

Without this pattern, your agent will lie to you. Not maliciously — optimistically. It will tell you the cool new thing is great because the README says it's great. You'll spend weeks integrating something that doesn't work. We've all done it. This prompt is the discipline that prevents it.

The discipline is portable. You don't need our skills, our codebase, or our agents. You need: (1) your own knowledge base written down honestly, and (2) the discipline to run the cross-check phase every time, without skipping.

That's the whole pattern.
