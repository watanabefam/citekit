<!--
  spec-driven-development preset — command contribution.
  Composed with strategy: "prepend", so this sits AFTER the command's YAML frontmatter
  and BEFORE its own steps.
  Contract: this contribution only ADDS rules. It never removes, reorders, or overrides
  any step the core command defines.
-->

## Keep a durable record of every amendment (mandatory)

The core step writes a **Sync Impact Report** into the constitution and then expects it removed
before commit. That is deliberate — it is review material, not governance content. But the
consequence is that an amendment's **reasoning does not survive its own commit**, and a rule whose
factual premise later goes stale cannot be detected by anyone reading the result.

A rule with no recorded rationale leaves a future reader exactly two choices: accept it blindly, or
change it blindly. Both are wrong when the context has moved, and this is a well-documented failure
— hence the established practice of **architecture decision records**, which exist to preserve the
motivation behind a decision rather than only its outcome. Follow that shape.

### Write the record in the same change

1. Create the record **in the same change as the amendment**, not afterwards. An amendment whose
   record is deferred never gets one.
2. Choose its home by whether the amendment belongs to a spec:
   - **Belongs to a spec** → `decision.md` inside that spec's folder.
   - **A standalone amendment** → a file in a `decisions/` folder at the repository root.
3. Reference it from the constitution so the result points at the reasoning (a relative path from
   the constitution to the record is enough). The Sync Impact Report will be deleted; the pointer
   must not depend on it.

### The record's shape

- **Title** — a short noun phrase naming the decision, not the topic.
- **Context** — the forces in tension, value-neutral. Facts, not advocacy.
- **Decision** — in full sentences, active voice, "We will …". **One decision per record.**
- **Status** — `Proposed` / `Accepted` / `Superseded by <record>`.
- **Consequences** — the resulting context. Include the **negative** consequences and any
  follow-up records this one implies.
- **Evidence** — what the decision rests on, with identifiers, and the **confidence** level.

### Rules

1. **Number sequentially and monotonically; never reuse a number.** Where several records may start
   in parallel, key the number to the work item rather than racing an ascending counter.
2. **Immutable once accepted.** Do not edit an accepted record's Context or Decision. To change the
   decision, write a **new** record and mark the old one `Superseded by <new>`, linking both ways.
   This preserves *when* and *why* the direction shifted.
3. **Always include Context and Consequences.** A record without a rationale loses its value the
   moment circumstances change, because nobody can judge whether it still applies.
4. **Name and cite any external premise the decision depends on.** An unrecorded factual premise is
   the usual reason a rule silently goes wrong; recording it is what makes re-checking possible.
   State the confidence, and let a low-confidence premise be visibly low-confidence.
5. **Record only significant, hard-to-reverse decisions.** A record for everything buries the ones
   that matter.

The record is a **governance artifact**: it is not deleted while the decision it describes is in
force, and it is never amended in place to say something the original decision did not say.
