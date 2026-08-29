# Shared Persona Profile Schema

This schema is the first implementation step for the kicli ↔ ia3simworld bridge.

It is designed to be:

- JSON-compatible
- JSON-LD friendly
- easy to export from kicli
- easy to import into ia3simworld

## Core objects

### PersonaProfile

```json
{
  "schema_version": "1.0",
  "profile_id": "player:uvlightdrops",
  "display_name": "flow",
  "identity": {
    "primary_id": "did:web:example.org",
    "aliases": ["acct:flow@example.org"]
  },
  "interests": [],
  "skills": [],
  "values": [],
  "knowledge_domains": [],
  "persona": {},
  "metadata": {}
}
```

### InterestItem

```json
{
  "name": "Philosophy",
  "qid": "Q5891",
  "intensity": 90,
  "tags": ["ethics", "epistemology"]
}
```

### SkillItem

```json
{
  "name": "Go programming",
  "level": "expert",
  "verified": false,
  "tags": ["backend", "simulation"]
}
```

### KnowledgeDomainItem

```json
{
  "domain_id": "software",
  "label": "Software Engineering",
  "block_count": 1200,
  "artifact_count": 18,
  "confidence": 0.92
}
```

### PersonaBlock

This is the simulation-facing part.

```json
{
  "innate": "curious, analytical, direct",
  "learned": "knowledge engineer with broad interests",
  "currently": "working on personal knowledge systems",
  "communication_style": "concise and references-heavy"
}
```

## Recommended top-level fields

| Field | Meaning |
|---|---|
| `schema_version` | profile schema version |
| `profile_id` | stable profile identifier |
| `display_name` | human-readable name |
| `identity` | DID/WebID/alias anchors |
| `interests` | weighted interests |
| `skills` | competency list |
| `values` | stable value set |
| `knowledge_domains` | aggregated domain stats from kicli |
| `persona` | ia3-facing simulation persona |
| `metadata` | provenance and export info |

## Minimal compatibility rule

Any consumer should be able to ignore unknown fields.

That allows the schema to evolve while remaining compatible.

