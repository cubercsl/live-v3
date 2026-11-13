# Development

## Toolchain and build

Use Java 21, the Gradle wrapper, Node.js, pnpm, and a browser. Gradle pins the frontend Node/pnpm versions; `-Pnpm.download=false` uses the installed Node runtime. Configure Git line endings and symlink support before cloning on Windows.

Build the backend and its embedded administration and overlay assets:

```sh
./gradlew :backend:release
```

The resulting development JAR is `artifacts/live-v3-dev.jar`. Start it with a contest configuration, then open `/admin` for controls or `/overlay` for the broadcast:

```sh
java -jar artifacts/live-v3-dev.jar --config-directory=config/<contest> --no-auth
```

Use `--no-auth` only for isolated development. Gradle and the IDE configurations under `.run` also support running a contest directly:

```sh
./gradlew :backend:run -Plive.dev.contest=<contest>
```

After changing inline request or controller helpers, rebuild without cached classes so nested inline call sites use the same implementation:

```sh
./gradlew :backend:clean :backend:release --no-build-cache
```

## Backend state and APIs

The Kotlin/Ktor backend exposes administration endpoints under `/api/admin`. Persistent widget settings are JSON files in the selected configuration directory. Endpoints under `/api/overlay` provide WebSocket updates and HTTP snapshots.

Contest integrations emit data updates through `org.icpclive.cds`. Full-reload sources can extend `FullReloadContestDataSource`; other sources emit incremental updates. See the [settings guide](settings.md) and [library guide](using-as-lib.md).

Team View positions persist settings and visibility independently. Each layout's Studio toggle selects immediate editing or a tab-local snapshot. Apply sends all position states through `/api/admin/<group>/apply`, which validates the complete body before changing controllers. Each position updates settings and visibility together. The overlay preloads same-team media replacements and crossfades changed regions while retaining unchanged players. See the [Team View guide](team-view.md) for operator and API behavior.

Analytics owns the current Featured selection and checks its existing expiration timestamp every second in the same serial event processor as operator actions. Expiration reuses the cancellation path to clear Analytics and queue state. A successful replacement clears the previous Analytics marker and establishes a new deadline. This uses wall-clock time, including after contest finalization.

The overlay identifies reaction media using the queue's existing featured media and reaction list. Its reducer tracks selection changes before React batches renders, allowing immediate deselection/reselection of the same run to restart playback. Completed reactions remain hidden through ordinary queue updates and snapshots. The card retains its media and row throughout the exit transition, then unmounts. No playback-completion API or administration credentials are required. The [overlay guide](frontend-tricks.md) describes the visible behavior and timeout configuration.

## Frontend workflow

Install dependencies from `src/frontend`:

```sh
pnpm install --frozen-lockfile
```

The workspace contains `overlay`, `admin-overlay`, `admin-configuration`, `admin-converter`, `admin-home-page`, `locator`, shared components, and browser tests.

Run the overlay against a local backend:

```sh
cd src/frontend/overlay
VITE_WEBSOCKET_URL=ws://localhost:8080/api/overlay pnpm start
```

For administration, configure both API roots:

```sh
cd src/frontend/admin-overlay
VITE_BACKEND_URL=http://localhost:8080/api/admin VITE_WEBSOCKET_URL=ws://localhost:8080/api/admin pnpm start
```

On Windows, set environment variables before invoking `pnpm start`. `PUBLIC_URL` selects an application's base path and `BUILD_PATH` selects its output directory. Gradle builds embedded assets for `/admin` and `/overlay`.

Run `pnpm exec tsc --noEmit` in an affected package, use its ESLint command for changed TypeScript/TSX files, and run `pnpm exec prettier --check <files>` from `src/frontend`.

## Interactive Team View preview

After building, start the isolated preview from `src/frontend/tests` with Node.js 24 or later and FFmpeg installed:

```sh
node team-view-preview.ts
```

Open `http://127.0.0.1:28090/` for the real administration interface alongside the real overlay renderer. The Program panel plays looping sample videos labeled by team and media type; Full screen enlarges it. `/admin/teamview` provides controls alone. An optional positional argument changes the port.

The initial launch generates short camera and screen WebM clips under the repository's `.cache/team-view-preview-media/`. Later launches reuse those files. Preview team IDs, university names, and short names come from the [2019 World Finals feed](../config/icpc-wf/2019/2019-event-feed-final.json). The generated clips are diagnostic samples, not contest footage.

Browser fixtures supply teams, standings, admin state, and overlay events. The control and Program frames synchronize through session-storage events within the same tab. Other tabs have separate simulated output and drafts. Reloading retains the tab's state; changing the fixture media version starts a fresh preview state.

Choose a team with Studio off to see an immediate switch. With Studio on, prepare team, media, or visibility changes and confirm the Program stays unchanged until Apply. Discard restores the editor without affecting output. Add `?failSaves=1` to exercise failed submissions. The preview does not contact a contest backend. Stop it with Ctrl+C.

## Regression tests

Build the release, then run focused suites from `src/frontend/tests`:

```sh
pnpm exec playwright test featured-run.spec.ts team-view.spec.ts team-view-api.spec.ts team-view-preview.spec.ts --workers=2 --reporter=line
```

`featured-run.spec.ts` starts isolated backend instances with a generated local CLICS feed and a short video. It checks natural playback completion, the intermediate translation and opacity of the exit animation, delayed unmounting in both queue orientations, replacement and replay during/after exit, preserved looping for camera media, manual cancellation, and expiration of both backend states. Timeout scenarios verify that switching or reselecting does not inherit the previous deadline. Test configurations and logs stay under the test output directory.

The reaction fixture is a generated test pattern. Regenerate it from the repository root with FFmpeg:

```sh
ffmpeg -f lavfi -i 'testsrc2=size=160x90:rate=10:duration=2' -an -c:v libvpx -b:v 40k -threads 1 -y src/frontend/tests/tests/fixtures/reaction.webm
```

`team-view.spec.ts` serves built assets with isolated HTTP/WebSocket fixtures. Administration cases cover immediate editing, Studio drafts, all-position Apply, visibility, discard, persistence, layout isolation, atomic clearing of duplicate additional media, failures, and request locks. Geometry tests cover long English names and fixed Studio controls at mobile, tablet, and desktop widths. Shared media selection is checked with Studio on/off; pending-state tests verify that locked controls retain their appearance and headings. Overlay cases exercise delayed media, synchronized region fades, unchanged-player continuity, rapid replacement/cancellation, failure retention, and preload audio gating with real video. Screenshots cover Single, SplitScreen, Studio drafts, and failed submissions.

`team-view-api.spec.ts` runs the built JAR with a no-op data source. It checks complete layout state application, rejection of malformed bodies before mutation, visibility, stacking order, layout isolation, and persistence across restart. Existing show-with-settings routes remain covered.

`team-view-preview.spec.ts` starts the actual preview server and verifies video playback, immediate switching, Studio publication, failed submissions, refresh, and tab isolation. It uses the same sample data as the interactive preview.

The capture suite runs backend instances against repository contest configurations:

```sh
pnpm exec playwright test capture.spec.ts
```

Playwright uses installed Google Chrome through `channel: "chrome"`. Prefer an existing browser; remove temporary browser installations and profiles after verification. Live HLS and MPEG-TS decoding require separate integration checks from the short WebM and image-based regressions.
