# Contributing

Issues and pull requests are welcome. Safety, correctness, and preserving PotensicPro-compatible output take priority over feature breadth.

## Setup

Prerequisites: Node.js 22 or 24 and npm.

```bash
git clone https://github.com/patbaumgartner/potensic-atom-mission-lab.git
cd potensic-atom-mission-lab
npm ci
npm run dev
```

The planner is available at <http://localhost:5173>. Device-side debug-clone scripts require Bash and Android platform/build tools; see [debug-clone-tools/README.md](debug-clone-tools/README.md).

## Before opening a pull request

```bash
npm run check
npm run knip
npm run audit:prod
```

`npm run check` runs type checking, linting, formatting, tests with the 100% logic-coverage gate, and the production build.

- Add behavioural tests for new logic and failure modes.
- Keep user-controlled files and network responses bounded and validated.
- Preserve workspace/project migration paths when changing persisted fields.
- For UI changes, verify desktop and mobile layouts and check the browser console.
- For flight behaviour changes, document what was validated in the field and what remains advisory.

Use Conventional Commit subjects where practical, for example `fix: reject oversized track imports`.

## Pull requests

Explain the user problem, the chosen trade-off, and how the change was tested. Do not include APKs, captured device data, private coordinates, signing keys, or other generated artefacts.

By contributing, you agree that your contribution is licensed under the repository's [MIT License](LICENSE).
