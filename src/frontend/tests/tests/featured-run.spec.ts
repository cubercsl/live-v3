import {
    test as base,
    expect,
    type Locator,
    type WebSocketRoute,
} from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { repoDir } from "./consts.js";
import type { AnalyticsMessage, QueueEvent } from "../../generated/api.js";

const fixtureVideo = new URL("./fixtures/reaction.webm", import.meta.url);
const transitionMs = 1200;
type Backend = {
    url: string;
    messages: () => Promise<AnalyticsMessage[]>;
    select: (id: string, media?: string) => Promise<number>;
    hide: (id: string) => Promise<void>;
    queue: () => Promise<QueueEvent>;
};

const test = base.extend<{ backend: Backend; featuredTtl: number }>({
    featuredTtl: [30, { option: true }],
    backend: async ({ request, featuredTtl }, use, info) => {
        const reservation = createServer();
        await new Promise<void>((resolve) =>
            reservation.listen(0, "127.0.0.1", resolve),
        );
        const address = reservation.address();
        if (!address || typeof address === "string")
            throw new Error("Missing test port");
        const port = address.port;
        await new Promise<void>((resolve) =>
            reservation.close(() => resolve()),
        );
        const url = `http://127.0.0.1:${port}`;
        const config = info.outputPath("backend-config");
        await mkdir(join(config, "media"), { recursive: true });
        await writeFile(
            join(config, "media/reaction.webm"),
            await readFile(fixtureVideo),
        );
        await writeFile(
            join(config, "settings.json"),
            JSON.stringify({
                type: "clics",
                feeds: [
                    {
                        source: ".",
                        contestId: "test",
                        eventFeedPath: "",
                        feedVersion: "2023_06",
                    },
                ],
            }),
        );
        await writeFile(
            join(config, "advanced.json"),
            JSON.stringify([
                {
                    type: "overrideQueue",
                    featuredRunWaitTimeSeconds: featuredTtl,
                },
            ]),
        );
        const start = "2025-01-01T10:00:00Z";
        const end = "2025-01-01T15:00:00Z";
        const events: { type: string; data: Record<string, unknown> }[] = [
            {
                type: "contest",
                data: {
                    id: "test",
                    name: "Featured test",
                    start_time: start,
                    duration: "5:00:00",
                    penalty_time: 20,
                },
            },
            {
                type: "problems",
                data: { id: "P", label: "P", name: "Problem", ordinal: 0 },
            },
            { type: "languages", data: { id: "cpp", name: "C++" } },
            {
                type: "judgement-types",
                data: {
                    id: "WA",
                    name: "Wrong answer",
                    solved: false,
                    penalty: true,
                },
            },
            ...["A", "B"].flatMap((id) => [
                {
                    type: "teams",
                    data: {
                        id,
                        name: `Team ${id}`,
                        group_ids: [],
                        webcam: [
                            {
                                href: `${url}/media/reaction.webm?camera`,
                                mime: "video/webm",
                            },
                        ],
                    },
                },
                {
                    type: "submissions",
                    data: {
                        id,
                        team_id: id,
                        problem_id: "P",
                        language_id: "cpp",
                        time: start,
                        contest_time: "0:00:01",
                        reaction: [
                            {
                                href: `${url}/media/reaction.webm`,
                                mime: "video/webm",
                            },
                        ],
                    },
                },
                {
                    type: "judgements",
                    data: {
                        id,
                        submission_id: id,
                        judgement_type_id: "WA",
                        start_time: start,
                        end_time: start,
                        start_contest_time: "0:00:01",
                        end_contest_time: "0:00:02",
                    },
                },
            ]),
            {
                type: "state",
                data: {
                    started: start,
                    ended: end,
                    finalized: end,
                    end_of_updates: end,
                },
            },
        ];
        await writeFile(
            join(config, "event-feed"),
            events
                .map((event, index) =>
                    JSON.stringify({
                        token: String(index),
                        id: event.data.id ?? null,
                        ...event,
                    }),
                )
                .join("\n") + "\n",
        );
        let child: ChildProcess | undefined;
        const messages = async (): Promise<AnalyticsMessage[]> => {
            const response = await request.get(url + "/api/admin/analytics");
            expect(response.ok()).toBe(true);
            return response.json();
        };
        try {
            child = spawn(
                "java",
                [
                    "-Xmx256m",
                    "-jar",
                    join(repoDir, "artifacts/live-v3-dev.jar"),
                    `--config-directory=${config}`,
                    `--port=${port}`,
                    "--ktor-arg=-host=127.0.0.1",
                    "--no-auth",
                    `--log-file=${info.outputPath("backend.log")}`,
                ],
                { cwd: repoDir, stdio: ["ignore", "pipe", "pipe"] },
            );
            child.stdout!.on("data", (data) => process.stdout.write(data));
            child.stderr!.on("data", (data) => process.stderr.write(data));
            await expect
                .poll(
                    async () => {
                        if (child!.exitCode !== null)
                            throw new Error(
                                `Backend exited: ${child!.exitCode}`,
                            );
                        try {
                            return (
                                await request.get(
                                    url + "/api/admin/analytics",
                                    { timeout: 1000 },
                                )
                            ).status();
                        } catch {
                            return 0;
                        }
                    },
                    { timeout: 30000 },
                )
                .toBe(200);
            await expect.poll(async () => (await messages()).length).toBe(2);
            await use({
                url,
                messages,
                select: async (id, media = "reactionVideo") => {
                    const before = (await messages()).find(
                        (message) => message.id === `run_${id}`,
                    )?.featuredRun?.expirationTimeUnixMs;
                    const response = await request.post(
                        `${url}/api/admin/analytics/run_${id}/featuredRun`,
                        {
                            data: JSON.stringify(media),
                            headers: { "Content-Type": "application/json" },
                        },
                    );
                    expect((await response.json()).status).toBe("ok");
                    let expiration = before;
                    await expect
                        .poll(async () => {
                            expiration = (await messages()).find(
                                (message) => message.id === `run_${id}`,
                            )?.featuredRun?.expirationTimeUnixMs;
                            return expiration != null && expiration !== before;
                        })
                        .toBe(true);
                    return expiration!;
                },
                hide: async (id) => {
                    const response = await request.delete(
                        `${url}/api/admin/analytics/run_${id}/featuredRun`,
                    );
                    expect((await response.json()).status).toBe("ok");
                },
                queue: async () =>
                    (await request.get(url + "/api/overlay/queue")).json(),
            });
        } finally {
            if (child && child.exitCode === null && child.signalCode === null) {
                const exited = once(child, "exit");
                child.kill("SIGTERM");
                await exited;
            }
        }
    },
});

test.setTimeout(60000);
const overlayUrl = (url: string, horizontal: boolean) =>
    url +
    "/overlay?" +
    new URLSearchParams({
        noStatus: "",
        teamMediaAudio: "false",
        forceWidgets: JSON.stringify([
            {
                type: "QueueWidget",
                widgetId: "queue",
                widgetLocationId: "queue",
                settings: { horizontal },
            },
        ]),
        forceVisualConfig: JSON.stringify({
            QUEUE_ROW_FEATURED_RUN_APPEAR_TIME: transitionMs,
            WIDGET_POSITIONS: {
                queue: {
                    positionX: horizontal ? 400 : 1500,
                    positionY: 700,
                    sizeX: horizontal ? 1400 : 400,
                    sizeY: 300,
                },
            },
        }),
    });
const cardFor = (video: Locator) => video.locator("../..");
const expectExitAnimation = async (card: Locator, timeout = 5000) => {
    await expect
        .poll(
            () =>
                card.evaluate((element) =>
                    element
                        .getAnimations()
                        .some(
                            (animation) =>
                                (animation.effect as KeyframeEffect)
                                    .getKeyframes()
                                    .at(-1)?.opacity === "0",
                        ),
                ),
            { timeout },
        )
        .toBe(true);
    const frames = await card.evaluate((element) => {
        const animation = element.getAnimations()[0];
        const duration = Number(animation.effect!.getTiming().duration);
        animation.pause();
        const sample = (progress: number) => {
            animation.currentTime = duration * progress;
            const style = getComputedStyle(element);
            return {
                opacity: Number(style.opacity),
                x: new DOMMatrix(style.transform).m41,
            };
        };
        const frames = [sample(0), sample(0.25), sample(0.75)];
        animation.currentTime = 0;
        animation.play();
        return frames;
    });
    expect(frames[0].opacity).toBe(1);
    expect(frames[1].opacity).toBeGreaterThan(0);
    expect(frames[1].opacity).toBeLessThan(1);
    expect(frames[1].x).toBeGreaterThan(frames[0].x);
    expect(frames[2].x).toBeGreaterThan(frames[1].x);
    await expect(card).toBeAttached();
};

for (const horizontal of [false, true]) {
    test(`reaction ends with an exit animation and stays hidden (${horizontal ? "horizontal" : "vertical"})`, async ({
        page,
        backend,
    }) => {
        let queueSocket: WebSocketRoute;
        await page.routeWebSocket("**/api/overlay/queue", (socket) => {
            socket.connectToServer();
            queueSocket = socket;
        });
        await page.goto(overlayUrl(backend.url, horizontal));
        await backend.select("A");
        const video = page.locator("video");
        await expect(video).toBeVisible();
        expect(
            await video.evaluate((element: HTMLVideoElement) => element.loop),
        ).toBe(false);
        const card = cardFor(video);
        await expectExitAnimation(card);
        await expect(video).toHaveCount(0);
        expect(
            (await backend.messages())
                .filter((message) => message.featuredRun)
                .map((message) => message.id),
        ).toEqual(["run_A"]);
        const snapshot = await backend.queue();
        if (snapshot.type !== "QueueSnapshot")
            throw new Error("Expected queue snapshot");
        queueSocket!.send(JSON.stringify(snapshot));
        queueSocket!.send(
            JSON.stringify({
                type: "ModifyRunInQueue",
                info: {
                    ...snapshot.infos[0],
                    result: {
                        type: "IN_PROGRESS",
                        testedPart: 0.5,
                        isAfterFirstOk: false,
                    },
                },
            }),
        );
        await page.waitForTimeout(300);
        await expect(video).toHaveCount(0);
        await backend.select("B");
        await expect(video).toBeVisible();
        await expect(cardFor(video)).toContainText("Team B");
    });

    for (const next of ["A", "B"]) {
        test(`select ${next} during exit starts a fresh playback (${horizontal ? "horizontal" : "vertical"})`, async ({
            page,
            backend,
        }) => {
            await page.goto(overlayUrl(backend.url, horizontal));
            await backend.select("A");
            const video = page.locator("video");
            await expect(video).toBeVisible();
            const original = await video.elementHandle();
            await expectExitAnimation(cardFor(video));
            await backend.select(next);
            await expect(video).toBeVisible();
            expect(
                await video.evaluate(
                    (element, old) => element === old,
                    original,
                ),
            ).toBe(false);
            expect(
                await video.evaluate(
                    (element: HTMLVideoElement) => element.currentTime,
                ),
            ).toBeLessThan(1);
            await expect
                .poll(() =>
                    video.evaluate(
                        (element: HTMLVideoElement) => element.ended,
                    ),
                )
                .toBe(false);
            await expect(cardFor(video)).toContainText(`Team ${next}`);
        });
    }
}

test("manual cancellation animates and non-reaction media keeps looping", async ({
    page,
    backend,
}) => {
    await page.goto(overlayUrl(backend.url, false));
    await backend.select("A", "camera");
    const video = page.locator("video");
    await expect(video).toBeVisible();
    expect(
        await video.evaluate((element: HTMLVideoElement) => element.loop),
    ).toBe(true);
    await page.waitForTimeout(2500);
    await expect(video).toBeVisible();
    await backend.hide("A");
    await expectExitAnimation(cardFor(video));
    await expect(video).toHaveCount(0);
});

test.describe("featured timeout", () => {
    test.use({ featuredTtl: 6 });
    test("expiration also keeps the card mounted for its exit animation", async ({
        page,
        backend,
    }) => {
        await page.goto(overlayUrl(backend.url, true));
        await backend.select("A", "camera");
        const video = page.locator("video");
        await expect(video).toBeVisible();
        await expectExitAnimation(cardFor(video), 10000);
        await expect(video).toHaveCount(0);
        expect(
            (await backend.messages()).filter((message) => message.featuredRun),
        ).toEqual([]);
    });
    for (const next of ["A", "B"]) {
        test(`selection of ${next} replaces the previous deadline and expires both states`, async ({
            backend,
        }) => {
            const oldExpiration = await backend.select("A");
            await expect
                .poll(() => Date.now(), { timeout: 6000 })
                .toBeGreaterThan(oldExpiration - 2500);
            const expiration = await backend.select(next);
            await expect
                .poll(() => Date.now(), { timeout: 6000 })
                .toBeGreaterThan(oldExpiration + 1100);
            expect(
                (await backend.messages())
                    .filter((message) => message.featuredRun)
                    .map((message) => message.id),
            ).toEqual([`run_${next}`]);
            await expect
                .poll(
                    async () =>
                        (await backend.messages()).filter(
                            (message) => message.featuredRun,
                        ),
                    { timeout: 8000 },
                )
                .toEqual([]);
            expect(Date.now()).toBeGreaterThanOrEqual(expiration);
            await expect
                .poll(async () => {
                    const snapshot = await backend.queue();
                    if (snapshot.type !== "QueueSnapshot")
                        throw new Error("Expected queue snapshot");
                    return snapshot.infos.filter(
                        (run) => run.featuredRunMedia !== null,
                    );
                })
                .toEqual([]);
        });
    }
});
