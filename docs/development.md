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

## Regression tests

Build the release, then run focused suites from `src/frontend/tests`:

```sh
pnpm exec playwright test featured-run.spec.ts --workers=2 --reporter=line
```

`featured-run.spec.ts` starts isolated backend instances with a generated local CLICS feed and a short video. It checks natural playback completion, the intermediate translation and opacity of the exit animation, delayed unmounting in both queue orientations, replacement and replay during/after exit, preserved looping for camera media, manual cancellation, and expiration of both backend states. Timeout scenarios verify that switching or reselecting does not inherit the previous deadline. Test configurations and logs stay under the test output directory.

The reaction fixture is a generated test pattern. Regenerate it from the repository root with FFmpeg:

```sh
ffmpeg -f lavfi -i 'testsrc2=size=160x90:rate=10:duration=2' -an -c:v libvpx -b:v 40k -threads 1 -y src/frontend/tests/tests/fixtures/reaction.webm
```

The capture suite runs backend instances against repository contest configurations:

```sh
pnpm exec playwright test capture.spec.ts
```

Playwright uses installed Google Chrome through `channel: "chrome"`. Prefer an existing browser; remove temporary browser installations and profiles after verification. Live HLS and MPEG-TS decoding require separate integration checks from these short WebM regressions.
