# Null Island — notes for an agent working in this repo

Generates geospatial files with specific things wrong with them, so a map viewer can be tested against the files it will actually receive. It also generates the control case — a valid file with nothing wrong with it — because "does this reader handle good data" is the question worth settling first.

There is a second half: **search terms**. A map has two inputs, and the other one is the sentence somebody types above it — "devices in Tokyo and Kyoto", "devices that were in the Estádio da Luz in Lisbon last week". Same contract, different ground truth: a file's is a feature count, a query's is the interpretation it should have been given.

Everything is deterministic from a seed: the same seed produces byte-identical output in the browser, in the CLI and in CI. That property is the product, not an implementation detail. Anything that adds, removes or reorders a draw from the RNG changes every fixture that seed ever produced, so treat `rng.*` call sites as append-only unless you mean to break reproducibility.

## Layout

```
packages/core   the generator. No dependencies, no DOM. Runs in Node and in a browser.
packages/cli    a thin front for core — same generator, same bytes
apps/web        the Next.js app at nullisland.app. Static export; nothing is uploaded
api/            one serverless function: GET /api/terms, a corpus over HTTP
```

`api/` sits beside the static export rather than inside it — Vercel picks up a root `api/` directory as functions, so `output: "export"` is untouched and the page still makes no network requests after load. The function is a front for core like the CLI is; it must not grow generation logic of its own.

Core is the only place that knows how to build a file. The CLI and the web app both call `generate()` and neither reimplements anything — if you find yourself adding generation logic outside `packages/core`, that is the bug.

## Commands

```bash
npm run check      # typecheck + verify + lint + smoke + web check. Run this before saying done
npm run verify -w nullisland-core   # the generator's own test suite (~2,450 assertions)
npm run soak                        # five fresh corpora at 100% intensity, read for anything wrong
npm run cli -- --help               # the CLI, run from source
npm run dev        # the web app
npm run build      # core, cli and a static web export
```

`npm run cli -- <options>` builds core first, then runs the CLI **from source**. When piping, use `npm run --silent cli -- …` or npm's banner lands on stdout in front of the file.

`npx nullisland <options>` also works inside this repo — npm workspaces link `node_modules/.bin/nullisland` to `packages/cli/dist/index.js`. It is a build artefact, so after editing source it runs the previous build until `npm run build`, silently. Prefer `npm run cli` while developing, and note that neither package is published to npm, so `npx nullisland` outside this repo will not resolve.

## The CLI is the machine-readable surface

Prefer it over reading source when you need to know what exists:

```bash
npm run --silent cli -- --list problems --json   # every problem, and the formats/data types it applies to
npm run --silent cli -- --list types --json      # every data type, its geometry, its columns
npm run --silent cli -- --list all --json        # the whole catalogue: kinds, their nouns and the words people use
npm run --silent cli -- --list quirks --json     # every search quirk, its phase, and what it needs
npm run --silent cli -- --list places --json     # the gazetteer: coords, aliases, ambiguity
npm run --silent cli -- --clean --count 20 --json   # the result as data, including the checks that ran
npm run --silent cli -- --terms 43 --stdout      # a set of search terms as JSONL, one per line
```

`--json` reports what was *actually applied*, not what was asked for: a problem the chosen format cannot express is dropped and reported as skipped, and so is a quirk the query shape cannot carry. Assert on the returned `problems` / `quirks` array, never on the flags you passed. Exit codes: `0` success, `1` a clean file or term set failed its own check (a bug in this tool), `2` a usage error.

Full option reference: [packages/cli/README.md](packages/cli/README.md).

## How generation is structured

`base.ts` builds a clean, well-formed dataset. Every problem in the catalogue is a transform applied on top of that, in a fixed order. So with nothing selected you get a valid file — that is the control case, and `clean.ts` inspects it before it is handed over rather than taking it on trust.

- `base.ts` — the clean dataset every problem starts from
- `mutate.ts` / `domain.ts` — problems as transforms; `domain.ts` holds the ones that only exist inside a particular data type
- `text.ts` — byte-level corruption applied after serialisation (BOM, CRLF, mojibake)
- `formats/` — one writer per format; the shapefile and ZIP writers are hand-rolled
- `profiles/` — the 23 data types plus a generic export: field lists, geometry, and the cross-column arithmetic that has to hold before anything breaks it
- `clean.ts` — the checks that establish a control fixture really is one
- `problems.ts` — the catalogue, including which formats and data types can express what

Adding a problem is a catalogue entry plus one transform. Adding a data type is a field list — the writers, the UI and the CLI pick it up from there.

## How the search half is structured

Same shape, one directory over in `packages/core/src/search/`:

- `places.ts` — the gazetteer, and the ground truth. Coordinates are real; ambiguity, aliases and renames are real. An invented one would fail a geocoder for a reason no user can reproduce.
- `phrasing.ts` — the sentence around the filter: intents, the subject noun per data type, the templates
- `time.ts` — time expressions and the windows they resolve to, anchored to a fixed instant rather than the clock
- `quirks.ts` — the catalogue: what is hard about a query, and what a query must already contain before each entry means anything
- `terms.ts` — the planner, the quirks as transforms over it, and the expected parse that comes out
- `clean.ts` — the checks, which run in both directions (see below)
- `write.ts` — five containers: jsonl, json, csv, txt, md

A quirk has a **phase**, exactly as a problem does: `plan` changes what the query asks for — which place, which window, how the sentence is built — and so changes the expected answer alongside the words; `text` runs on the finished string and leaves the expectation alone. A text quirk that rewrites the whole sentence (casing, curly quotes) must return a `retype` so the place names recorded in the expectation are rewritten the same way, or the term stops describing itself.

With no quirks selected the catalogue is dealt out one per term, so a set of 46 is 46 different problems. `clean: true` is how you ask for none.

A term can name several kinds of thing, or none: `expect.subjects` is always a list of `{typed, canonical, dataType}` and `expect.anySubject` covers "everything in Tokyo". Several kinds means a **union** — nothing is both a device and an aircraft — and `typed` differs from `canonical` whenever somebody used their word rather than the schema's. Every template in `phrasing.ts` must render the subject slot; one that does not makes every term claim a noun its own text lacks, which is what `inspectTerms` will fail on.

Adding a quirk is a catalogue entry plus one transform, and `verify.ts` will fail the build if the entry exists with nothing behind it.

A quirk that **decides** something another quirk also decides must say so with `claims` — `place`, `window`, `voice`, `kinds` or `wrapper`. Two claimants on one term means the second overwrote the first while the term went on reporting both, which is the overclaiming bug in its purest form; `assign()` lets at most one through. If a transform calls `swapTo`, it is deciding the place and it claims `place`.

`npm run soak` is the other half of the suite: `verify.ts` asserts properties, the soak reads whole corpora at 100% intensity looking for sentences no one would type. Stacked quirks interact, and that is where the bugs are.

## What this codebase is strict about

**It does not lie about its own output.** A file that is clean is described as clean; a problem a format cannot express is reported as skipped rather than silently dropped; a lossy container says what it lost. When you add a code path, make sure the notes, the context block and the `--json` summary all still describe the file that was actually produced. `verify.ts` asserts several of these directly.

The search half has a sharper version of the same rule, and it is the easiest thing to break: **the expectation must describe the query text that was actually written.** If a quirk mangles a place name, `expect.places[].typed` has to carry the mangled spelling; if the renderer drops a time expression, the window has to go with it. `inspectTerms` checks this on every set, quirked or not, and a failure is reported as a bug in Null Island rather than in the reader's search. Related: an ambiguous place has `resolvesTo: null` on purpose — naming a winner would contradict the note printed beside it — and `candidates` is ordered biggest first so the conventional tie-break is still testable.

**Numbers that reach file content are locale-free.** Use `group()` from `format.ts`, not `toLocaleString` — `verify.ts` fails the build if a generator source file uses the latter.

**A relative window is anchored, not read off the clock.** `DEFAULT_ANCHOR` is a fixed instant, and `generateTerms` resolves every "last week" against it. Never reach for `Date.now()` in `search/` — a fixture whose expected answer changes overnight is not a fixture.

**A share link is the whole configuration.** Anything the app can hold has to survive a round trip through `encodeConfig`/`decodeConfig`, or a link rebuilds a different file than the one on screen. Fractions are quantised in `generate()` for exactly this reason.
