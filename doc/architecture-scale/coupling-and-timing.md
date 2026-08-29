# Coupling and Timing

## Realtime coupling

These interactions must stay fast:

- UI polling world state
- player commands
- simulation tick updates
- agent actions applied to the world

## Near-realtime coupling

These can happen every few seconds or minutes:

- agent planning updates
- federation sector announcements
- settings changes
- controlled regeneration

## Batch coupling

These should be asynchronous and tolerate delay:

- profile import from kicli
- semantic enrichment
- embeddings generation
- artifact generation
- search indexing
- daily summaries
- knowledge graph rebuilds

## Good rule

If a task can wait an hour without breaking the user experience, it should not live in the realtime plane.

## Example: profile import

Profile import is a batch job because:

- it does not need to affect the next tick immediately
- it can be retried safely
- it may depend on external data or human curation
- it can produce a versioned export artifact

This makes it a strong candidate for a separate worker service or job queue.

