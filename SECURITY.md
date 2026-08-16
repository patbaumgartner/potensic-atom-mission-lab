# Security Policy

## Supported versions

This project is pre-1.0. Security fixes are applied to the latest commit on `main` and the current GitHub Pages deployment only.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub's private reporting form:

<https://github.com/patbaumgartner/potensic-atom-mission-lab/security/advisories/new>

Include the affected component, impact, reproduction steps, and a minimal proof of concept. Remove private coordinates, device identifiers, APKs, signing keys, and captured account data.

## Scope notes

- The browser planner stores mission/project data in local browser storage; it is not encrypted.
- Address searches are sent to OpenStreetMap Nominatim. Map tiles are requested from OpenStreetMap or Esri.
- Debug-clone tools are for apps and devices you own. Generated signing keys are local credentials and must not be committed or shared.
- The historical repository-shared debug key is public and must not be treated as a trusted signing identity.
