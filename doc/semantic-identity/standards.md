# Standards

## ActivityPub / Fediverse

ActivityPub is widely deployed, but profile data is shallow. In practice it carries:

- `name`
- `summary`
- `attachment`
- `tag`

Interests are usually free text or hashtags. That is useful for federation, but weak for semantic compatibility.

## Solid / WebID

Solid stores profile data in RDF/Turtle documents inside personal pods.

It can represent:

- FOAF
- schema.org
- SKOS

This is semantically strong, but adoption is still limited.

## DID + Verifiable Credentials

DIDs identify the subject.
VCs carry claims about the subject.

This makes them good for:

- skills
- occupations
- certificates
- signed profile assertions

## FOAF

FOAF remains useful as a semantic vocabulary base.

Relevant fields:

- `foaf:name`
- `foaf:interest`
- `foaf:topic_interest`
- `foaf:knows`
- `foaf:currentProject`
- `foaf:made`

FOAF does not model proficiency, values, or deep competency structure.

## schema.org/Person

This is the most practical deployed profile vocabulary.

Relevant fields:

- `knowsAbout`
- `knowsLanguage`
- `hasOccupation`
- `skills`
- `hasCredential`
- `memberOf`
- `worksFor`
- `alumniOf`

`knowsAbout` is the most useful semantic interest field for the target use case.

## OpenBadges 3.0

OpenBadges 3.0 is the most mature standard for verifiable skill claims.

It is built on W3C Verifiable Credentials and is already used in credential platforms.

## SKOS and Wikidata

SKOS is the standard for controlled vocabularies and taxonomies.

Wikidata QIDs are the best practical global topic identifiers because they offer:

- multilingual labels
- hierarchy
- cross references

