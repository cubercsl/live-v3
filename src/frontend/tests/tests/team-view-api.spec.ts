import { test as base, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { repoDir } from "./consts.js";

type Backend = { url: string; config: string; restart: () => Promise<void> };
const test = base.extend<{ backend: Backend }>({
    backend: async ({ request }, use, info) => {
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
        const config = info.outputPath("backend-config");
        await mkdir(config, { recursive: true });
        await writeFile(
            join(config, "settings.json"),
            JSON.stringify({ type: "noop" }),
        );
        const url = `http://127.0.0.1:${port}`;
        let child: ChildProcess;
        const stop = async () => {
            if (child && child.exitCode === null && child.signalCode === null) {
                const exited = once(child, "exit");
                child.kill("SIGTERM");
                await exited;
            }
        };
        const start = async () => {
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
                        if (child.exitCode !== null)
                            throw new Error(
                                `Backend exited: ${child.exitCode}`,
                            );
                        try {
                            return (
                                await request.get(url + "/api/admin/teamPVP/", {
                                    timeout: 1000,
                                })
                            ).status();
                        } catch {
                            return 0;
                        }
                    },
                    { timeout: 20000 },
                )
                .toBe(200);
        };
        try {
            await start();
            await use({
                url,
                config,
                restart: async () => {
                    await stop();
                    await start();
                },
            });
        } finally {
            await stop();
        }
    },
});
test.setTimeout(60000);
const settings = (teamId: string) => ({
    teamId,
    mediaTypes: ["camera", null],
    showTaskStatus: false,
    showAchievement: false,
    showTimeLine: true,
});

test("group application preserves visible stacking order and survives restart", async ({
    request,
    backend,
}) => {
    const root = backend.url + "/api/admin/teamPVP";
    expect(
        (
            await request.post(root + "/PVP_TOP/show_with_settings", {
                data: settings("A"),
            })
        ).status(),
    ).toBe(200);
    const preset = join(backend.config, "presets/teamPVP/PVP_TOP.json");
    await expect
        .poll(async () => {
            try {
                return JSON.parse(await readFile(preset, "utf8")).showOrder;
            } catch {
                return undefined;
            }
        })
        .toBeDefined();
    const showOrder = JSON.parse(await readFile(preset, "utf8")).showOrder;
    const batch = {
        PVP_TOP: settings("B"),
        PVP_BOTTOM: { ...settings("C"), mediaTypes: ["screen", "camera"] },
    };
    expect(
        (
            await request.post(root + "/show_with_settings", { data: batch })
        ).status(),
    ).toBe(200);
    const after = await (await request.get(root + "/")).json();
    for (const id of Object.keys(batch)) {
        expect(after[id].shown).toBe(true);
        expect(after[id].settings).toMatchObject(batch[id]);
    }
    await expect
        .poll(
            async () =>
                JSON.parse(await readFile(preset, "utf8")).settings.teamId,
        )
        .toBe("B");
    expect(JSON.parse(await readFile(preset, "utf8")).showOrder).toBe(
        showOrder,
    );
    const bottom = join(backend.config, "presets/teamPVP/PVP_BOTTOM.json");
    await expect
        .poll(
            async () =>
                JSON.parse(await readFile(bottom, "utf8")).settings.teamId,
        )
        .toBe("C");
    await backend.restart();
    expect(await (await request.get(root + "/")).json()).toEqual(after);
    expect((await request.post(root + "/hide")).status()).toBe(200);
    const hidden = await (await request.get(root + "/")).json();
    expect(hidden.PVP_TOP.shown).toBe(false);
    expect(hidden.PVP_BOTTOM.shown).toBe(false);
    expect(hidden.PVP_TOP.settings).toEqual(after.PVP_TOP.settings);
});

test("rejects incomplete or malformed groups before changing any position", async ({
    request,
    backend,
}) => {
    const root = backend.url + "/api/admin/teamPVP";
    const initial = { PVP_TOP: settings("A"), PVP_BOTTOM: settings("B") };
    expect(
        (
            await request.post(root + "/show_with_settings", { data: initial })
        ).status(),
    ).toBe(200);
    const before = await (await request.get(root + "/")).json();
    const invalid = [
        { PVP_TOP: settings("C") },
        { ...initial, TOP_LEFT: settings("C") },
        { TOP_LEFT: settings("C"), TOP_RIGHT: settings("B") },
        {
            PVP_TOP: settings("C"),
            PVP_BOTTOM: { ...settings("D"), mediaTypes: ["not-a-media"] },
        },
        {
            PVP_TOP: settings("C"),
            PVP_BOTTOM: { ...settings("D"), showTimeLine: "not-a-boolean" },
        },
    ];
    for (const body of invalid) {
        const response = await request.post(root + "/show_with_settings", {
            data: body,
        });
        expect(response.status()).toBe(400);
        expect((await response.json()).status).toBe("error");
        expect(await (await request.get(root + "/")).json()).toEqual(before);
    }
    expect(
        (
            await request.post(root + "/show_with_settings", {
                data: "{",
                headers: { "Content-Type": "application/json" },
            })
        ).status(),
    ).toBe(400);
    expect(await (await request.get(root + "/")).json()).toEqual(before);
    const split = Object.fromEntries(
        ["TOP_LEFT", "TOP_RIGHT", "BOTTOM_LEFT", "BOTTOM_RIGHT"].map((id) => [
            id,
            settings(id),
        ]),
    );
    expect(
        (
            await request.post(
                backend.url + "/api/admin/splitScreen/show_with_settings",
                { data: split },
            )
        ).status(),
    ).toBe(200);
    const splitStatus = await (
        await request.get(backend.url + "/api/admin/splitScreen/")
    ).json();
    for (const id of Object.keys(split))
        expect(splitStatus[id]).toMatchObject({
            shown: true,
            settings: split[id],
        });
});

for (const [group, positions] of Object.entries({
    teamView: ["SINGLE"],
    teamPVP: ["PVP_TOP", "PVP_BOTTOM"],
    splitScreen: ["TOP_LEFT", "TOP_RIGHT", "BOTTOM_LEFT", "BOTTOM_RIGHT"],
})) {
    test(`Studio applies ${group} settings and visibility without changing other layouts`, async ({
        request,
        backend,
    }) => {
        const root = `${backend.url}/api/admin/${group}`;
        await request.post(`${root}/${positions[0]}/show_with_settings`, {
            data: settings("A"),
        });
        const preset = join(
            backend.config,
            `presets/${group}/${positions[0]}.json`,
        );
        await expect
            .poll(async () => {
                try {
                    return JSON.parse(await readFile(preset, "utf8")).showOrder;
                } catch {
                    return undefined;
                }
            })
            .toBeDefined();
        const order = JSON.parse(await readFile(preset, "utf8")).showOrder;
        const otherGroup = group === "teamView" ? "teamPVP" : "teamView";
        const otherBefore = await (
            await request.get(`${backend.url}/api/admin/${otherGroup}/`)
        ).json();
        const states = Object.fromEntries(
            positions.map((id, index) => [
                id,
                {
                    settings: settings(`new-${id}`),
                    shown: index % 2 === 0,
                },
            ]),
        );
        expect(
            (await request.post(root + "/apply", { data: states })).status(),
        ).toBe(200);
        const after = await (await request.get(root + "/")).json();
        for (const id of positions) expect(after[id]).toMatchObject(states[id]);
        await expect
            .poll(
                async () =>
                    JSON.parse(await readFile(preset, "utf8")).settings.teamId,
            )
            .toBe(`new-${positions[0]}`);
        expect(JSON.parse(await readFile(preset, "utf8")).showOrder).toBe(
            order,
        );
        expect(
            await (
                await request.get(`${backend.url}/api/admin/${otherGroup}/`)
            ).json(),
        ).toEqual(otherBefore);
        for (const id of positions) {
            await expect
                .poll(async () => {
                    try {
                        return JSON.parse(
                            await readFile(
                                join(
                                    backend.config,
                                    `presets/${group}/${id}.json`,
                                ),
                                "utf8",
                            ),
                        ).settings.teamId;
                    } catch {
                        return undefined;
                    }
                })
                .toBe(`new-${id}`);
        }
        await backend.restart();
        expect(await (await request.get(root + "/")).json()).toEqual(after);
        const hidden = Object.fromEntries(
            positions.map((id) => [id, { ...states[id], shown: false }]),
        );
        expect(
            (await request.post(root + "/apply", { data: hidden })).status(),
        ).toBe(200);
        for (const status of Object.values(
            await (await request.get(root + "/")).json(),
        ))
            expect(status).toMatchObject({ shown: false });
    });
}

test("Studio rejects malformed state maps before changing any position", async ({
    request,
    backend,
}) => {
    const root = backend.url + "/api/admin/teamPVP";
    await request.post(root + "/PVP_TOP/show_with_settings", {
        data: settings("A"),
    });
    const before = await (await request.get(root + "/")).json();
    const valid = {
        PVP_TOP: { settings: settings("B"), shown: false },
        PVP_BOTTOM: { settings: settings("C"), shown: true },
    };
    for (const data of [
        {},
        { PVP_TOP: valid.PVP_TOP },
        { ...valid, SINGLE: valid.PVP_TOP },
        { ...valid, PVP_BOTTOM: { settings: settings("C") } },
        {
            ...valid,
            PVP_BOTTOM: { ...valid.PVP_BOTTOM, shown: "not-a-boolean" },
        },
        {
            ...valid,
            PVP_BOTTOM: {
                ...valid.PVP_BOTTOM,
                settings: { mediaTypes: ["invalid"] },
            },
        },
    ]) {
        expect((await request.post(root + "/apply", { data })).status()).toBe(
            400,
        );
        expect(await (await request.get(root + "/")).json()).toEqual(before);
    }
    expect(
        (
            await request.post(root + "/apply", {
                data: "{",
                headers: { "Content-Type": "application/json" },
            })
        ).status(),
    ).toBe(400);
    expect(await (await request.get(root + "/")).json()).toEqual(before);
});
