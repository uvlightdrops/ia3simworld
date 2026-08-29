# Overview

There is no single dominant standard for rich personal profiles in 2025.

The ecosystem is split across:

- identity anchors
- semantic profile vocabularies
- skill credentials
- topic taxonomies
- persona formats for agents and NPCs

## Best practical combination

| Layer | Recommended format |
|---|---|
| Identity | DID:web / WebID |
| Profile envelope | schema.org/Person |
| Interests / topics | schema.org `knowsAbout` + Wikidata QIDs + SKOS |
| Skills | OpenBadges 3.0 / Verifiable Credentials |
| Persona for simulation | Stanford Generative Agents style model |

## Core conclusion

For compatibility, do not invent a closed format first.
Use a layered export:

1. JSON-LD profile
2. semantic topic links
3. optional signed skill credentials
4. simulation persona projection

