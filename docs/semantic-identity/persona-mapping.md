# Persona Mapping for ia3simworld

The simulation layer should not consume the raw knowledge model directly.

It should consume a persona projection derived from the profile.

## Recommended mapping

| Profile field | ia3simworld field |
|---|---|
| name / identity | Agent.Name |
| interests | Agent.Interests |
| skills | Agent.Role / behavior weights |
| values | decision bias / domain preference |
| current goals | Agent.Status / task selection |
| stable biography | learned persona text |
| temperament | innate trait text |

## Best persona pattern

The Stanford Generative Agents model is the most useful reference:

- `innate` = stable traits
- `learned` = biography and knowledge
- `currently` = current goals and context

That structure is much better than a flat prompt-only persona.

## Suggested profile export shape

```json
{
  "schema_version": "1.0",
  "profile_id": "player:example",
  "name": "Example",
  "interests": [
    { "name": "Philosophy", "intensity": 90, "qid": "Q5891" }
  ],
  "skills": [
    { "name": "Programming", "level": "expert" }
  ],
  "values": ["truth", "autonomy", "craftsmanship"],
  "persona": {
    "innate": "curious, reflective, analytical",
    "learned": "knowledge engineer with broad interests",
    "currently": "working on personal knowledge systems"
  }
}
```

## Recommendation

Use JSON-LD for interoperability, then map it into the simulation persona model.

