import {
    test as base,
    expect,
    Page,
    WebSocketRoute,
    Route,
    Locator,
} from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const frontend = fileURLToPath(new URL("../../", import.meta.url));
const image = (color: string) =>
    `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="${color}"/></svg>`)}`;
const camera = { type: "Image", url: image("red") };
const screen = { type: "Image", url: image("blue") };
const achievement = { type: "Image", url: image("green") };
const team = (id: string) => ({
    id,
    name: `Team ${id}`,
    shortName: `Team ${id}`,
    groups: [],
    medias: { camera: [camera], screen: [screen], achievement: [achievement] },
    isHidden: false,
    isOutOfContest: false,
    customFields: {},
});
const teams = [team("A"), team("B"), team("C")];
const saved = () => ({
    teamId: "A",
    mediaTypes: ["camera", null],
    showTaskStatus: false,
    showAchievement: false,
    showTimeLine: false,
    position: "SINGLE",
});
type Settings = ReturnType<typeof saved>;
type Slot = { shown: boolean; settings: Settings };
const slots = [
    "SINGLE",
    "PVP_TOP",
    "PVP_BOTTOM",
    "TOP_LEFT",
    "TOP_RIGHT",
    "BOTTOM_LEFT",
    "BOTTOM_RIGHT",
];
const groups = {
    teamView: slots.slice(0, 1),
    teamPVP: slots.slice(1, 3),
    splitScreen: slots.slice(3),
};

type App = {
    url: string;
    state: Record<string, Slot>;
    requests: { path: string; body: unknown }[];
    failSave: boolean;
    teamsGate?: Promise<void>;
    mutationGate?: Promise<void>;
    overlaySocket?: WebSocketRoute;
};

const test = base.extend<{ app: App }>({
    app: async ({ page }, use) => {
        const server = createServer(async (req, res) => {
            try {
                const path = new URL(req.url!, "http://localhost").pathname;
                const [, section, ...rest] = path.split("/");
                const directory =
                    section === "admin" ? "admin-overlay" : "overlay";
                const relative = rest.join("/");
                const filename = extname(relative) ? relative : "index.html";
                const content = await readFile(
                    join(frontend, directory, "build", filename),
                );
                const mime = {
                    ".js": "text/javascript",
                    ".css": "text/css",
                    ".html": "text/html",
                    ".woff2": "font/woff2",
                }[extname(filename)];
                res.writeHead(200, {
                    "Content-Type": mime ?? "application/octet-stream",
                });
                res.end(content);
            } catch (error) {
                res.writeHead(500);
                res.end(String(error));
            }
        });
        await new Promise<void>((resolve) =>
            server.listen(0, "127.0.0.1", resolve),
        );
        const address = server.address();
        if (!address || typeof address === "string")
            throw new Error("Missing test port");
        const app: App = {
            url: `http://127.0.0.1:${address.port}`,
            state: Object.fromEntries(
                slots.map((slot) => [
                    slot,
                    { shown: false, settings: saved() },
                ]),
            ),
            requests: [],
            failSave: false,
        };
        let adminSocket: WebSocketRoute | undefined;
        await page.routeWebSocket("**/api/**", (socket) => {
            const path = new URL(socket.url()).pathname;
            if (path.endsWith("/adminActions")) adminSocket = socket;
            if (path.endsWith("/mainScreen")) {
                app.overlaySocket = socket;
                socket.send(
                    JSON.stringify({ type: "MainScreenSnapshot", widgets: [] }),
                );
            }
            if (path.endsWith("/contestInfo"))
                socket.send(
                    JSON.stringify({
                        name: "Test",
                        teams,
                        problems: [],
                        groups: [],
                        organizations: [],
                        status: { type: "before" },
                        resultType: "ICPC",
                        contestLengthMs: 18000000,
                        freezeTimeMs: 14400000,
                        customFields: {},
                        languages: [],
                        awardsSettings: [],
                        penaltyPerWrongAttemptSeconds: 1200,
                        penaltyRoundingMode: "each_submission_down_to_minute",
                    }),
                );
            if (path.includes("/teamRuns/")) socket.send("[]");
        });
        await page.route("**/api/**", async (route) => {
            const request = route.request();
            const path = new URL(request.url()).pathname;
            const [, , , group, slot, action] = path.split("/");
            if (request.method() !== "GET") {
                const body = request.postDataJSON();
                app.requests.push({ path, body });
                if (app.mutationGate) await app.mutationGate;
                if (
                    app.failSave &&
                    (action === "show_with_settings" || !action)
                ) {
                    await route.fulfill({
                        status: 500,
                        json: { status: "error", message: "Save rejected" },
                    });
                    return;
                }
                if (slot === "show_with_settings" || slot === "apply") {
                    if (
                        JSON.stringify(Object.keys(body).sort()) !==
                        JSON.stringify([...groups[group]].sort())
                    ) {
                        await route.fulfill({
                            status: 400,
                            json: { status: "error" },
                        });
                        return;
                    }
                    for (const id of groups[group])
                        app.state[id] =
                            slot === "apply"
                                ? body[id]
                                : { settings: body[id], shown: true };
                    await route.fulfill({ json: { status: "ok" } });
                    adminSocket?.send(path);
                    return;
                }
                const selected = groups[group]?.includes(slot)
                    ? [slot]
                    : groups[group];
                for (const id of selected ?? []) {
                    if (
                        action === "show_with_settings" ||
                        (!action && groups[group]?.includes(slot))
                    )
                        app.state[id].settings = body;
                    if (
                        action === "show_with_settings" ||
                        action === "show" ||
                        slot === "show"
                    )
                        app.state[id].shown = true;
                    if (action === "hide" || slot === "hide")
                        app.state[id].shown = false;
                }
                await route.fulfill({ json: { status: "ok" } });
                adminSocket?.send(path);
                return;
            }
            if (path.endsWith("/teams")) {
                if (app.teamsGate) await app.teamsGate;
                await route.fulfill({ json: teams });
            } else if (path.endsWith("/usage_stats")) {
                await route.fulfill({ json: { type: "per_team", byTeam: {} } });
            } else if (groups[group] && !slot) {
                await route.fulfill({
                    json: Object.fromEntries(
                        groups[group].map((id) => [id, app.state[id]]),
                    ),
                });
            } else {
                await route.fulfill({
                    json: {
                        CONTEST_COLOR: "#0a4497",
                        CONTEST_NAME: "Provincial warmup",
                    },
                });
            }
        });
        try {
            await use(app);
        } finally {
            server.closeAllConnections();
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    },
});

test.setTimeout(30000);
test.use({ actionTimeout: 10000 });

const pick = (page: Page, id: string) =>
    page.getByRole("button", { name: `${id}: Team ${id}`, exact: true });
const mainMedia = (page: Page, name: string) =>
    page
        .getByRole("group", { name: "Main content", exact: true })
        .getByRole("button", { name, exact: true });
const option = (page: Page, name: string) =>
    page.getByRole("group", { name, exact: true }).getByRole("button");
const expectSavedControls = async (page: Page) => {
    await expect(mainMedia(page, "camera")).toHaveClass(/MuiButton-contained/);
    await expect(
        page
            .getByRole("group", { name: "Additional content" })
            .getByRole("button", { name: "empty", exact: true }),
    ).toHaveClass(/MuiButton-contained/);
    for (const name of [
        "Name, ranking, submissions",
        "Achievements",
        "TimeLine",
    ]) {
        await expect(option(page, name)).toHaveText("Show");
    }
};

test("one click switches and shows a hidden position while retaining its settings", async ({
    page,
    app,
}, info) => {
    await page.goto(app.url + "/admin/teamview");
    await expectSavedControls(page);
    await pick(page, "B").click();
    await expect.poll(() => app.state.SINGLE.settings.teamId).toBe("B");
    expect(app.requests).toEqual([
        {
            path: "/api/admin/teamView/SINGLE/show_with_settings",
            body: { ...saved(), teamId: "B" },
        },
    ]);
    expect(app.state.SINGLE.shown).toBe(true);
    await expect(pick(page, "B")).toHaveAttribute("aria-pressed", "true");
    await expect(pick(page, "C")).toBeVisible();
    await pick(page, "C").click();
    await expect.poll(() => app.state.SINGLE.settings.teamId).toBe("C");
    await expectSavedControls(page);
    await page.screenshot({
        path: info.outputPath("single.png"),
        fullPage: true,
    });
});

test("waits for delayed teams without losing saved media or disabled switches", async ({
    page,
    app,
}) => {
    let release!: () => void;
    app.teamsGate = new Promise((resolve) => {
        release = resolve;
    });
    await page.goto(app.url + "/admin/teamview");
    await expect(page.getByText("Loading team views…")).toBeVisible();
    release();
    await expectSavedControls(page);
    await pick(page, "B").click();
    await expect.poll(() => app.state.SINGLE.settings.teamId).toBe("B");
    expect(app.state.SINGLE.settings.mediaTypes).toEqual(["camera", null]);
});

test("applies settings immediately while preserving hidden or visible state", async ({
    page,
    app,
}, info) => {
    await page.goto(app.url + "/admin/teamview");
    await option(page, "TimeLine").click();
    await expect.poll(() => app.state.SINGLE.settings.showTimeLine).toBe(true);
    expect(app.state.SINGLE.shown).toBe(false);
    expect(app.requests[0].path).toBe("/api/admin/teamView/SINGLE");
    await mainMedia(page, "screen").click();
    await expect
        .poll(() => app.state.SINGLE.settings.mediaTypes)
        .toEqual(["screen", null]);
    await page.screenshot({
        path: info.outputPath("hidden-settings.png"),
        fullPage: true,
    });
    await pick(page, "B").click();
    await expect.poll(() => app.state.SINGLE.shown).toBe(true);
    await option(page, "Achievements").click();
    await expect
        .poll(() => app.state.SINGLE.settings.showAchievement)
        .toBe(true);
    expect(app.state.SINGLE.settings.showTimeLine).toBe(true);
    expect(app.state.SINGLE.shown).toBe(true);
});

test("keeps independent positions selected for repeated team changes", async ({
    page,
    app,
}, info) => {
    app.state.TOP_RIGHT.settings = {
        ...saved(),
        mediaTypes: ["screen", "camera"],
        showTaskStatus: true,
    };
    await page.goto(app.url + "/admin/teamview");
    await page
        .getByRole("button", { name: "SplitScreen", exact: true })
        .click();
    await page
        .getByRole("button", { name: "Target Top right", exact: true })
        .click();
    await expect(mainMedia(page, "screen")).toHaveClass(/MuiButton-contained/);
    await pick(page, "B").click();
    await expect.poll(() => app.state.TOP_RIGHT.settings.teamId).toBe("B");
    await pick(page, "C").click();
    await expect.poll(() => app.state.TOP_RIGHT.settings.teamId).toBe("C");
    expect(app.state.TOP_RIGHT.settings.mediaTypes).toEqual([
        "screen",
        "camera",
    ]);
    expect(app.state.TOP_LEFT.settings).toEqual(saved());
    await expect(
        page.getByRole("button", { name: "Target Top right", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({
        path: info.outputPath("split.png"),
        fullPage: true,
    });
    await page
        .getByRole("button", { name: "Target Top left", exact: true })
        .click();
    await expect(mainMedia(page, "camera")).toHaveClass(/MuiButton-contained/);
});

test("remembers mode, target, and search across navigation and refresh", async ({
    page,
    app,
}) => {
    await page.goto(app.url + "/admin/teamview");
    await page
        .getByRole("button", { name: "SplitScreen", exact: true })
        .click();
    await page
        .getByRole("button", { name: "Target Bottom right", exact: true })
        .click();
    await page.getByRole("textbox", { name: "Search teams" }).fill("Team B");
    await pick(page, "B").click();
    await expect.poll(() => app.state.BOTTOM_RIGHT.settings.teamId).toBe("B");
    await expect(
        page.getByRole("textbox", { name: "Search teams" }),
    ).toHaveValue("Team B");
    await page.getByRole("button", { name: "Controls", exact: true }).click();
    await page.getByRole("button", { name: "TeamView", exact: true }).click();
    await expect(
        page.getByRole("button", { name: "Target Bottom right", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(
        page.getByRole("button", { name: "SplitScreen", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
        page.getByRole("textbox", { name: "Search teams" }),
    ).toHaveValue("Team B");
    await expect(
        page.getByRole("button", { name: "Target Bottom right", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "PVP", exact: true }).click();
    await expect(
        page.getByRole("button", { name: "Target Top", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page
        .getByRole("button", { name: "SplitScreen", exact: true })
        .click();
    await expect(
        page.getByRole("button", { name: "Target Bottom right", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
});

test("remembers an explicit mode choice even while another mode is displayed", async ({
    page,
    app,
}) => {
    app.state.TOP_LEFT.shown = true;
    await page.goto(app.url + "/admin/teamview");
    await expect(
        page.getByRole("button", { name: "SplitScreen", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Single", exact: true }).click();
    await page.getByRole("button", { name: "Controls", exact: true }).click();
    await page.getByRole("button", { name: "TeamView", exact: true }).click();
    await expect(
        page.getByRole("button", { name: "Single", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(
        page.getByRole("button", { name: "Single", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(app.state.TOP_LEFT.shown).toBe(true);
    expect(app.requests).toEqual([]);
});

test("leaves confirmed values intact after failed immediate changes", async ({
    page,
    app,
}, info) => {
    app.failSave = true;
    await page.goto(app.url + "/admin/teamview");
    await option(page, "TimeLine").click();
    await expect(
        page.getByText("Failed to save /teamView", { exact: true }),
    ).toBeVisible();
    await expect(option(page, "TimeLine")).toHaveText("Show");
    await pick(page, "B").click();
    await expect.poll(() => app.requests.length).toBe(2);
    await expect(pick(page, "A")).toHaveAttribute("aria-pressed", "true");
    expect(app.state.SINGLE.settings).toEqual(saved());
    expect(app.state.SINGLE.shown).toBe(false);
    await page.screenshot({
        path: info.outputPath("failed-change.png"),
        fullPage: true,
    });
    app.failSave = false;
    await pick(page, "B").click();
    await expect.poll(() => app.state.SINGLE.settings.teamId).toBe("B");
});

test("locks a pending position and Studio toggle while other positions remain usable", async ({
    page,
    app,
}) => {
    let release!: () => void;
    app.mutationGate = new Promise((resolve) => {
        release = resolve;
    });
    await page.goto(app.url + "/admin/teamview");
    await page
        .getByRole("button", { name: "SplitScreen", exact: true })
        .click();
    await pick(page, "B").click();
    await expect(pick(page, "C")).toBeDisabled();
    await expect(mainMedia(page, "screen")).toBeDisabled();
    await expect(studioToggle(page)).toBeDisabled();
    await page
        .getByRole("button", { name: "Target Top right", exact: true })
        .click();
    await expect(pick(page, "C")).toBeEnabled();
    await page
        .getByRole("button", { name: "Target Top left", exact: true })
        .click();
    await expect(pick(page, "C")).toBeDisabled();
    release();
    await expect(pick(page, "C")).toBeEnabled();
    await option(page, "Name, ranking, submissions").click();
    await expect
        .poll(() => app.state.TOP_LEFT.settings.showTaskStatus)
        .toBe(true);
    expect(app.state.TOP_LEFT.settings.teamId).toBe("B");
    expect(app.requests).toHaveLength(2);
});

test("visibility actions retain configuration and Automode remains selectable", async ({
    page,
    app,
}) => {
    await page.goto(app.url + "/admin/teamview");
    await expect(
        page.getByRole("button", { name: "Show Single", exact: true }),
    ).toHaveCount(0);
    await expect(
        page.getByRole("button", { name: "Hide Single", exact: true }),
    ).toHaveCount(0);
    const position = page.getByRole("group", {
        name: "Single position",
        exact: true,
    });
    await position.getByRole("button", { name: "Show", exact: true }).click();
    await expect.poll(() => app.state.SINGLE.shown).toBe(true);
    await position.getByRole("button", { name: "Hide", exact: true }).click();
    await expect.poll(() => app.state.SINGLE.shown).toBe(false);
    expect(app.state.SINGLE.settings).toEqual(saved());
    await page.getByRole("button", { name: "Automode", exact: true }).click();
    await expect.poll(() => app.state.SINGLE.settings.teamId).toBe(null);
    expect(app.state.SINGLE.shown).toBe(true);
    expect(app.state.SINGLE.settings.mediaTypes).toEqual(["camera", null]);
});

const studioToggle = (page: Page) =>
    page.getByRole("switch", { name: "Studio", exact: true });
const applyButton = (page: Page) =>
    page.getByRole("button", { name: "Apply", exact: true });
const visibleToggle = (page: Page, name: string) =>
    page
        .getByRole("group", { name: `${name} position`, exact: true })
        .getByRole("switch", { name: "Visible", exact: true });

test("Studio applies teams, media, switches and visibility in one layout request", async ({
    page,
    app,
}, info) => {
    app.state.PVP_TOP.shown = true;
    app.state.PVP_BOTTOM.shown = true;
    const before = structuredClone(app.state);
    await page.goto(app.url + "/admin/teamview");
    await studioToggle(page).check();
    await expect(applyButton(page)).toBeDisabled();
    await pick(page, "B").click();
    await mainMedia(page, "screen").click();
    await option(page, "TimeLine").click();
    await page
        .getByRole("button", { name: "Target Bottom", exact: true })
        .click();
    await pick(page, "C").click();
    await visibleToggle(page, "Bottom").uncheck();
    expect(app.requests).toEqual([]);
    expect(app.state).toEqual(before);
    await expect(
        page
            .getByRole("group", { name: "Draft configuration", exact: true })
            .getByText("Team B", { exact: true }),
    ).toBeVisible();
    await expect(
        page
            .getByRole("group", { name: "Draft configuration", exact: true })
            .getByText("Team C", { exact: true }),
    ).toBeVisible();
    await expect(applyButton(page)).toHaveCount(1);
    await page.screenshot({
        path: info.outputPath("studio-pvp.png"),
        fullPage: true,
    });
    await applyButton(page).click();
    await expect.poll(() => app.requests.length).toBe(1);
    expect(app.requests[0]).toEqual({
        path: "/api/admin/teamPVP/apply",
        body: {
            PVP_TOP: {
                settings: {
                    ...saved(),
                    teamId: "B",
                    mediaTypes: ["screen", null],
                    showTimeLine: true,
                },
                shown: true,
            },
            PVP_BOTTOM: { settings: { ...saved(), teamId: "C" }, shown: false },
        },
    });
    await expect(applyButton(page)).toBeDisabled();
    expect(app.state.SINGLE).toEqual(before.SINGLE);
    expect(app.state.TOP_LEFT).toEqual(before.TOP_LEFT);
});

test("Studio preserves drafts through navigation, refresh and disabling the toggle", async ({
    page,
    app,
}) => {
    await page.goto(app.url + "/admin/teamview");
    await studioToggle(page).check();
    await pick(page, "B").click();
    await visibleToggle(page, "Single").check();
    await studioToggle(page).uncheck();
    await expect(pick(page, "A")).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Controls", exact: true }).click();
    await page.getByRole("button", { name: "TeamView", exact: true }).click();
    await page.reload();
    await expect(studioToggle(page)).not.toBeChecked();
    await studioToggle(page).check();
    await expect(pick(page, "B")).toHaveAttribute("aria-pressed", "true");
    await expect(visibleToggle(page, "Single")).toBeChecked();
    expect(app.requests).toEqual([]);
    await applyButton(page).click();
    await expect.poll(() => app.state.SINGLE.settings.teamId).toBe("B");
    expect(app.state.SINGLE.shown).toBe(true);
});

test("failed Studio apply retains drafts and locks only the submitted layout", async ({
    page,
    app,
}, info) => {
    await page.goto(app.url + "/admin/teamview");
    await page.getByRole("button", { name: "PVP", exact: true }).click();
    await studioToggle(page).check();
    await pick(page, "B").click();
    let release!: () => void;
    app.mutationGate = new Promise((resolve) => {
        release = resolve;
    });
    app.failSave = true;
    await applyButton(page).click();
    await expect(studioToggle(page)).toBeDisabled();
    await expect(pick(page, "C")).toBeDisabled();
    await expect(visibleToggle(page, "Bottom")).toBeDisabled();
    await expect(
        page.getByRole("button", { name: "Discard changes" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Single", exact: true }).click();
    await expect(studioToggle(page)).toBeEnabled();
    await page.getByRole("button", { name: "PVP", exact: true }).click();
    release();
    await expect(
        page.getByText("Failed to save /teamPVP", { exact: true }),
    ).toBeVisible();
    await expect(
        page
            .getByRole("group", { name: "Draft configuration", exact: true })
            .getByText("Team B", { exact: true }),
    ).toBeVisible();
    expect(app.state.PVP_TOP.settings).toEqual(saved());
    await page.screenshot({
        path: info.outputPath("studio-failed.png"),
        fullPage: true,
    });
    app.failSave = false;
    await applyButton(page).click();
    await expect.poll(() => app.state.PVP_TOP.settings.teamId).toBe("B");
    expect(app.state.PVP_TOP.shown).toBe(false);
    await expect(applyButton(page)).toBeDisabled();
});

test("Discard restores latest server state and leaves other layout drafts intact", async ({
    page,
    app,
}) => {
    await page.goto(app.url + "/admin/teamview");
    await studioToggle(page).check();
    await pick(page, "B").click();
    await visibleToggle(page, "Single").check();
    await page.getByRole("button", { name: "PVP", exact: true }).click();
    await studioToggle(page).check();
    await pick(page, "C").click();
    await page.getByRole("button", { name: "Single", exact: true }).click();
    await studioToggle(page).uncheck();
    await pick(page, "C").click();
    await expect.poll(() => app.state.SINGLE.settings.teamId).toBe("C");
    await studioToggle(page).check();
    await page.getByRole("button", { name: "Discard changes" }).click();
    await expect(pick(page, "C")).toHaveAttribute("aria-pressed", "true");
    await expect(visibleToggle(page, "Single")).toBeChecked();
    await expect(applyButton(page)).toBeDisabled();
    expect(app.requests).toHaveLength(1);
    await page.getByRole("button", { name: "PVP", exact: true }).click();
    await expect(applyButton(page)).toBeEnabled();
    await expect(
        page
            .getByRole("group", { name: "Draft configuration", exact: true })
            .getByText("Team C", { exact: true }),
    ).toBeVisible();
});

test("Studio recognizes reverted edits and applies the complete split layout", async ({
    page,
    app,
}, info) => {
    await page.goto(app.url + "/admin/teamview");
    await page
        .getByRole("button", { name: "SplitScreen", exact: true })
        .click();
    await studioToggle(page).check();
    await pick(page, "B").click();
    await pick(page, "A").click();
    await expect(applyButton(page)).toBeDisabled();
    await expect(
        page.getByRole("button", { name: "Discard changes" }),
    ).toBeDisabled();
    await pick(page, "B").click();
    await visibleToggle(page, "Top left").check();
    await page
        .getByRole("button", { name: "Target Bottom right", exact: true })
        .click();
    await pick(page, "C").click();
    await page.screenshot({
        path: info.outputPath("studio-split.png"),
        fullPage: true,
    });
    await applyButton(page).click();
    await expect.poll(() => app.requests.length).toBe(1);
    expect(app.requests[0]).toEqual({
        path: "/api/admin/splitScreen/apply",
        body: {
            TOP_LEFT: { settings: { ...saved(), teamId: "B" }, shown: true },
            TOP_RIGHT: { settings: saved(), shown: false },
            BOTTOM_LEFT: { settings: saved(), shown: false },
            BOTTOM_RIGHT: {
                settings: { ...saved(), teamId: "C" },
                shown: false,
            },
        },
    });
    await expect(applyButton(page)).toBeDisabled();
});

for (const studio of [false, true]) {
    test(`main media takes priority with Studio ${studio ? "on" : "off"}`, async ({
        page,
        app,
    }) => {
        app.state.SINGLE.settings.mediaTypes = ["screen", "camera"];
        await page.goto(app.url + "/admin/teamview");
        if (studio) await studioToggle(page).check();
        const additional = (name: string) =>
            page
                .getByRole("group", { name: "Additional content" })
                .getByRole("button", { name, exact: true });
        await expect(additional("screen")).toBeDisabled();
        await mainMedia(page, "camera").click();
        await expect(additional("empty")).toHaveClass(/MuiButton-contained/);
        if (!studio)
            expect((app.requests[0].body as Settings).mediaTypes).toEqual([
                "camera",
                null,
            ]);
        await additional("screen").click();
        await expect(mainMedia(page, "camera")).toHaveClass(
            /MuiButton-contained/,
        );
        await mainMedia(page, "empty").click();
        await expect(additional("screen")).toHaveClass(/MuiButton-contained/);
        await additional("empty").click();
        await expect(mainMedia(page, "empty")).toHaveClass(
            /MuiButton-contained/,
        );
        await mainMedia(page, "camera").click();
        await expect(additional("camera")).toBeDisabled();
        if (studio) {
            expect(app.requests).toEqual([]);
            expect(app.state.SINGLE.settings.mediaTypes).toEqual([
                "screen",
                "camera",
            ]);
            await applyButton(page).click();
        }
        await expect
            .poll(() => app.state.SINGLE.settings.mediaTypes)
            .toEqual(["camera", null]);
    });
}

const widget = (teamId: string, primary = camera, extras = {}) => ({
    type: "TeamViewWidget",
    widgetId: "teamViewSingle",
    widgetLocationId: "teamViewSingle",
    statisticsId: "teamView",
    settings: {
        teamId,
        primary: [primary],
        secondary: [],
        achievement: [],
        showTaskStatus: false,
        showTimeLine: false,
        position: "SINGLE",
        ...extras,
    },
});
const showWidget = (app: App, value: ReturnType<typeof widget>) =>
    app.overlaySocket!.send(
        JSON.stringify({ type: "ShowWidget", widget: value, showOrder: 1 }),
    );

test("applies same-team media and achievement changes without remounting unchanged media", async ({
    page,
    app,
}) => {
    await page.goto(app.url + "/overlay?noStatus");
    await expect.poll(() => Boolean(app.overlaySocket)).toBe(true);
    showWidget(app, widget("A"));
    const primary = page.locator(`img[src='${camera.url}']`);
    await expect(primary).toBeVisible();
    const original = await primary.elementHandle();
    showWidget(app, widget("A", camera, { achievement: [achievement] }));
    await expect(page.locator(`img[src='${achievement.url}']`)).toBeVisible();
    expect(
        await primary.evaluate((node, previous) => node === previous, original),
    ).toBe(true);
    showWidget(app, widget("A", screen));
    await expect(page.locator(`img[src='${screen.url}']`)).toBeVisible();
    await expect(page.locator(`img[src='${achievement.url}']`)).toHaveCount(0);
    await expect(page.locator(`img[src='${camera.url}']`)).toHaveCount(0);
});

test("cancels a pending team transition when returning to the displayed team", async ({
    page,
    app,
}) => {
    await page.goto(app.url + "/overlay?noStatus");
    await expect.poll(() => Boolean(app.overlaySocket)).toBe(true);
    showWidget(app, widget("A"));
    await expect(page.locator('[data-teamid="A"]')).toBeVisible();
    showWidget(app, widget("B", screen));
    await expect(page.locator('[data-teamid="B"]')).toBeAttached();
    showWidget(app, widget("A", camera, { achievement: [achievement] }));
    await expect(page.locator(`img[src='${achievement.url}']`)).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.locator('[data-teamid="B"]')).toHaveCount(0);
    await expect(page.locator('[data-teamid="A"]')).toBeVisible();
});

test("keeps the inferred split mode after hiding its last visible position", async ({
    page,
    app,
}) => {
    app.state.TOP_LEFT.shown = true;
    await page.goto(app.url + "/admin/teamview");
    await expect(
        page.getByRole("button", { name: "SplitScreen", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page
        .getByRole("group", { name: "Top left position", exact: true })
        .getByRole("button", { name: "Hide", exact: true })
        .click();
    await expect.poll(() => app.state.TOP_LEFT.shown).toBe(false);
    await expect(
        page.getByRole("button", { name: "SplitScreen", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
});

test("finishes the latest team replacement after rapid changes", async ({
    page,
    app,
}) => {
    await page.goto(app.url + "/overlay?noStatus");
    await expect.poll(() => Boolean(app.overlaySocket)).toBe(true);
    showWidget(app, widget("A"));
    await expect(page.locator('[data-teamid="A"]')).toBeVisible();
    showWidget(app, widget("B", screen));
    await expect(page.locator('[data-teamid="B"]')).toBeAttached();
    showWidget(app, widget("C", achievement));
    await expect(page.locator('[data-teamid="C"]')).toBeVisible();
    await expect(page.locator('[data-teamid="A"]')).toHaveCount(0);
    await expect(page.locator('[data-teamid="B"]')).toHaveCount(0);
});

const region = (page: Page, role: string) =>
    page.locator(`[data-media-region="${role}"]`);
const mediaLayer = (page: Page, url: string) =>
    page.locator(`[data-media-layer]:has([src='${url}'])`);
const holdImages = async (page: Page, app: App) => {
    const requests = new Map<string, Route>();
    await page.route("**/test-media/*.svg", (route) => {
        requests.set(new URL(route.request().url()).pathname, route);
    });
    return {
        media: (name: string) => ({
            type: "Image",
            url: `${app.url}/test-media/${name}.svg`,
        }),
        release: async (name: string, success = true) => {
            const path = `/test-media/${name}.svg`;
            await expect.poll(() => requests.has(path)).toBe(true);
            await requests.get(path)!.fulfill(
                success
                    ? {
                          contentType: "image/svg+xml",
                          body: decodeURIComponent(
                              image("purple").split(",")[1],
                          ),
                      }
                    : { status: 500, body: "Failed" },
            );
        },
    };
};

for (const [position, location] of [
    ["SINGLE", "teamViewSingle"],
    ["PVP_TOP", "teamViewPvpTop"],
    ["TOP_LEFT", "teamViewTopLeft"],
]) {
    test(`coordinates changed media readiness and fade in ${position}`, async ({
        page,
        app,
    }) => {
        const held = await holdImages(page, app);
        const nextMain = held.media("main"),
            nextSide = held.media("side");
        const scene = (main = camera, side = screen) => ({
            ...widget("A", main, { position, secondary: [side] }),
            widgetLocationId: location,
        });
        await page.goto(app.url + "/overlay?noStatus");
        await expect.poll(() => Boolean(app.overlaySocket)).toBe(true);
        showWidget(app, scene());
        await expect(mediaLayer(page, camera.url)).toHaveCSS("opacity", "1");
        showWidget(app, scene(nextMain, nextSide));
        await held.release("main");
        await expect(mediaLayer(page, nextMain.url)).toHaveCSS("opacity", "0");
        await expect(mediaLayer(page, camera.url)).toHaveCSS("opacity", "1");
        await held.release("side");
        await expect
            .poll(async () =>
                Number(
                    await mediaLayer(page, nextMain.url).evaluate(
                        (node) => getComputedStyle(node).opacity,
                    ),
                ),
            )
            .toBeGreaterThan(0);
        const opacity = Number(
            await mediaLayer(page, nextMain.url).evaluate(
                (node) => getComputedStyle(node).opacity,
            ),
        );
        expect(opacity).toBeLessThan(1);
        await expect(mediaLayer(page, camera.url)).toHaveCount(0);
        await expect(mediaLayer(page, screen.url)).toHaveCount(0);
        await expect(mediaLayer(page, nextMain.url)).toHaveCSS("opacity", "1");
        await expect(mediaLayer(page, nextSide.url)).toHaveCSS("opacity", "1");
    });
}

test("same-team loading reuses its candidate and ignores replaced candidates", async ({
    page,
    app,
}) => {
    const held = await holdImages(page, app);
    const pending = held.media("pending"),
        abandoned = held.media("abandoned");
    await page.goto(app.url + "/overlay?noStatus");
    await expect.poll(() => Boolean(app.overlaySocket)).toBe(true);
    showWidget(app, widget("A"));
    await expect(mediaLayer(page, camera.url)).toHaveCSS("opacity", "1");
    const original = await page
        .locator(`img[src='${camera.url}']`)
        .elementHandle();
    showWidget(app, widget("A", abandoned));
    await expect(page.locator(`img[src='${abandoned.url}']`)).toBeAttached();
    showWidget(app, widget("A", pending));
    await expect(page.locator(`img[src='${pending.url}']`)).toBeAttached();
    const candidate = await page
        .locator(`img[src='${pending.url}']`)
        .elementHandle();
    showWidget(app, widget("A", pending, { showTaskStatus: true }));
    await expect
        .poll(() =>
            page
                .locator(`img[src='${pending.url}']`)
                .evaluate((node, previous) => node === previous, candidate),
        )
        .toBe(true);
    await held.release("abandoned");
    await expect(mediaLayer(page, camera.url)).toHaveCSS("opacity", "1");
    showWidget(app, widget("A"));
    await expect(page.locator(`img[src='${pending.url}']`)).toHaveCount(0);
    await held.release("pending");
    expect(
        await page
            .locator(`img[src='${camera.url}']`)
            .evaluate((node, previous) => node === previous, original),
    ).toBe(true);
    await expect(region(page, "primary").locator("img")).toHaveCount(1);
});

test("failed secondary preserves live media and its layout until discarded", async ({
    page,
    app,
}) => {
    const held = await holdImages(page, app);
    const pending = held.media("broken");
    const errors: string[] = [];
    page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(app.url + "/overlay?noStatus");
    await expect.poll(() => Boolean(app.overlaySocket)).toBe(true);
    showWidget(app, widget("A", camera, { secondary: [screen] }));
    await expect(mediaLayer(page, camera.url)).toHaveCSS("opacity", "1");
    const original = await region(page, "primary")
        .locator("img")
        .elementHandle();
    const before = await region(page, "secondary").boundingBox();
    showWidget(
        app,
        widget("A", camera, {
            secondary: [pending],
            achievement: [achievement],
        }),
    );
    await held.release("broken", false);
    await expect
        .poll(() =>
            errors.some((error) =>
                error.includes("Unable to load image media"),
            ),
        )
        .toBe(true);
    expect(await region(page, "secondary").boundingBox()).toEqual(before);
    await expect(mediaLayer(page, screen.url)).toHaveCSS("opacity", "1");
    await expect(mediaLayer(page, achievement.url)).toHaveCSS("opacity", "0");
    expect(
        await region(page, "primary")
            .locator("img")
            .evaluate((node, previous) => node === previous, original),
    ).toBe(true);
    showWidget(app, widget("A", camera, { secondary: [screen] }));
    await expect(mediaLayer(page, pending.url)).toHaveCount(0);
    await expect(region(page, "achievement")).toHaveCount(0);
});

test("video stays playing when secondary changes and preload audio is muted", async ({
    page,
    app,
}) => {
    const clip = await readFile(
        join(frontend, "tests/tests/fixtures/reaction.webm"),
    );
    await page.route("**/test-media/*.webm", (route) =>
        route.fulfill({ contentType: "video/webm", body: clip }),
    );
    const main = { type: "Video", url: `${app.url}/test-media/main.webm` };
    const side = { type: "Video", url: `${app.url}/test-media/side.webm` };
    const held = await holdImages(page, app);
    const wait = held.media("gate");
    await page.goto(app.url + "/overlay?noStatus&teamMediaAudio=true");
    await page.mouse.click(10, 10);
    await expect.poll(() => Boolean(app.overlaySocket)).toBe(true);
    showWidget(app, widget("A", main));
    const video = region(page, "primary").locator("video");
    await expect(video).toHaveJSProperty("readyState", 4);
    await expect
        .poll(() =>
            video.evaluate((node: HTMLVideoElement) => node.currentTime),
        )
        .toBeGreaterThan(0);
    const original = await video.elementHandle();
    showWidget(
        app,
        widget("A", main, { secondary: [side], achievement: [wait] }),
    );
    const candidate = region(page, "secondary").locator("video");
    await expect(candidate).toHaveJSProperty("muted", true);
    await expect(mediaLayer(page, side.url)).toHaveCSS("opacity", "0");
    const candidateNode = await candidate.elementHandle();
    await held.release("gate");
    await expect(candidate).toHaveJSProperty("muted", false);
    await expect(mediaLayer(page, side.url)).toHaveCSS("opacity", "1");
    expect(
        await video.evaluate((node, previous) => node === previous, original),
    ).toBe(true);
    expect(
        await candidate.evaluate(
            (node, previous) => node === previous,
            candidateNode,
        ),
    ).toBe(true);
    await expect(video).toHaveJSProperty("paused", false);
});

test("incoming failure during a fade restores the healthy current player", async ({
    page,
    app,
}) => {
    await page.goto(app.url + "/overlay?noStatus");
    await expect.poll(() => Boolean(app.overlaySocket)).toBe(true);
    showWidget(app, widget("A"));
    await expect(mediaLayer(page, camera.url)).toHaveCSS("opacity", "1");
    const original = await page
        .locator(`img[src='${camera.url}']`)
        .elementHandle();
    showWidget(app, widget("A", screen));
    await expect
        .poll(() =>
            mediaLayer(page, screen.url).getAttribute("data-media-layer"),
        )
        .toBe("visible");
    await page.locator(`img[src='${screen.url}']`).dispatchEvent("error");
    await expect(mediaLayer(page, screen.url)).toHaveCSS("opacity", "0");
    await expect(mediaLayer(page, camera.url)).toHaveCSS("opacity", "1");
    expect(
        await page
            .locator(`img[src='${camera.url}']`)
            .evaluate((node, previous) => node === previous, original),
    ).toBe(true);
    await page.locator(`img[src='${screen.url}']`).dispatchEvent("load");
    await expect(mediaLayer(page, camera.url)).toHaveCount(0);
    await expect(mediaLayer(page, screen.url)).toHaveCSS("opacity", "1");
});

test("primary and secondary swap together, then empty media fades out", async ({
    page,
    app,
}) => {
    await page.goto(app.url + "/overlay?noStatus");
    await expect.poll(() => Boolean(app.overlaySocket)).toBe(true);
    showWidget(app, widget("A", camera, { secondary: [screen] }));
    await expect(region(page, "secondary").locator("img")).toBeVisible();
    showWidget(app, widget("A", screen, { secondary: [camera] }));
    await expect(region(page, "primary").locator("img")).toHaveCount(1);
    await expect(region(page, "primary").locator("img")).toHaveAttribute(
        "src",
        screen.url,
    );
    await expect(region(page, "secondary").locator("img")).toHaveAttribute(
        "src",
        camera.url,
    );
    const main = await region(page, "primary").locator("img").elementHandle();
    showWidget(app, widget("A", screen));
    await expect(region(page, "secondary")).toHaveCount(0);
    expect(
        await region(page, "primary")
            .locator("img")
            .evaluate((node, previous) => node === previous, main),
    ).toBe(true);
});

test("PvP achievement retains intrinsic height and SplitScreen ignores unrendered achievement", async ({
    page,
    app,
}) => {
    await page.goto(app.url + "/overlay?noStatus");
    await expect.poll(() => Boolean(app.overlaySocket)).toBe(true);
    const pvp = {
        ...widget("A", camera, {
            position: "PVP_TOP",
            achievement: [achievement],
        }),
        widgetLocationId: "teamViewPvpTop",
    };
    showWidget(app, pvp);
    await expect
        .poll(
            async () =>
                (await region(page, "achievement").boundingBox())?.height ?? 0,
        )
        .toBeGreaterThan(0);
    await expect(region(page, "achievement").locator("img")).toBeVisible();
    showWidget(app, {
        ...widget("B", screen, {
            position: "TOP_LEFT",
            achievement: [{ type: "Image", url: app.url + "/never.svg" }],
        }),
        widgetLocationId: "teamViewTopLeft",
    });
    await expect(page.locator('[data-teamid="B"]')).toBeVisible();
    await expect(page.locator('[data-teamid="A"]')).toHaveCount(0);
    await expect(region(page, "achievement")).toHaveCount(0);
});

test("latest media edit waits for an active fade and hiding releases all layers", async ({
    page,
    app,
}) => {
    await page.goto(app.url + "/overlay?noStatus");
    await expect.poll(() => Boolean(app.overlaySocket)).toBe(true);
    showWidget(app, widget("A"));
    await expect(mediaLayer(page, camera.url)).toHaveCSS("opacity", "1");
    showWidget(app, widget("A", screen));
    await expect
        .poll(() =>
            mediaLayer(page, screen.url).getAttribute("data-media-layer"),
        )
        .toBe("visible");
    showWidget(app, widget("A", achievement));
    await expect(mediaLayer(page, screen.url)).toHaveCount(1);
    await expect(mediaLayer(page, achievement.url)).toHaveCSS("opacity", "1");
    await expect(mediaLayer(page, screen.url)).toHaveCount(0);
    showWidget(app, widget("A", camera));
    app.overlaySocket!.send(
        JSON.stringify({ type: "HideWidget", id: "teamViewSingle" }),
    );
    await expect(page.locator("[data-media-layer]")).toHaveCount(0);
});

test("WebRTC proxy audio waits for presentation and resumes on promotion", async ({
    page,
    app,
}) => {
    await page.addInitScript(() => {
        class Peer {
            ontrack: (event: {
                track: MediaStreamTrack;
                streams: MediaStream[];
            }) => void;
            stream?: MediaStream;
            timer?: number;
            addTransceiver() {}
            async createOffer() {
                return { type: "offer", sdp: "fixture" };
            }
            async setLocalDescription() {}
            async setRemoteDescription() {
                const canvas = document.createElement("canvas");
                canvas.width = 160;
                canvas.height = 90;
                const context = canvas.getContext("2d")!;
                this.stream = canvas.captureStream(10);
                this.timer = window.setInterval(() => {
                    context.fillStyle = "blue";
                    context.fillRect(0, 0, canvas.width, canvas.height);
                }, 100);
                this.ontrack({
                    track: this.stream.getVideoTracks()[0],
                    streams: [this.stream],
                });
            }
            close() {
                clearInterval(this.timer);
                this.stream?.getTracks().forEach((track) => track.stop());
            }
        }
        window.RTCPeerConnection = Peer as unknown as typeof RTCPeerConnection;
    });
    const sampleRate = 8000,
        samples = sampleRate * 4;
    const wav = Buffer.alloc(44 + samples * 2);
    wav.write("RIFF", 0);
    wav.writeUInt32LE(wav.length - 8, 4);
    wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(sampleRate, 24);
    wav.writeUInt32LE(sampleRate * 2, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write("data", 36);
    wav.writeUInt32LE(samples * 2, 40);
    for (let i = 0; i < samples; i++)
        wav.writeInt16LE(
            Math.round(1000 * Math.sin((i * Math.PI) / 20)),
            44 + i * 2,
        );
    await page.route("**/test-media/audio.wav", (route) =>
        route.fulfill({ contentType: "audio/wav", body: wav }),
    );
    await page.route("**/test-media/signal", (route) =>
        route.fulfill({ json: { type: "answer", sdp: "fixture" } }),
    );
    const held = await holdImages(page, app);
    await page.goto(app.url + "/overlay?noStatus&teamMediaAudio=true");
    await page.mouse.click(10, 10);
    await expect.poll(() => Boolean(app.overlaySocket)).toBe(true);
    showWidget(app, widget("A"));
    await expect(mediaLayer(page, camera.url)).toHaveCSS("opacity", "1");
    showWidget(
        app,
        widget(
            "A",
            {
                type: "WebRTCProxyConnection",
                url: app.url + "/test-media/signal",
                audioUrl: app.url + "/test-media/audio.wav",
            } as typeof camera,
            { secondary: [held.media("gate")] },
        ),
    );
    const audio = page.locator("audio");
    await expect(audio).toHaveJSProperty("readyState", 4);
    await expect(audio).toHaveJSProperty("muted", true);
    await expect(mediaLayer(page, camera.url)).toHaveCSS("opacity", "1");
    await held.release("gate");
    await expect(audio).toHaveJSProperty("muted", false);
    await expect(audio).toHaveJSProperty("paused", false);
    await expect(mediaLayer(page, camera.url)).toHaveCount(0);
    await expect
        .poll(() =>
            audio.evaluate((node: HTMLAudioElement) => node.currentTime),
        )
        .toBeGreaterThan(0);
});

const documentBounds = (locator: Locator) =>
    locator.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return {
            x: rect.x + window.scrollX,
            y: rect.y + window.scrollY,
            width: rect.width,
            height: rect.height,
        };
    });
for (const width of [390, 900, 1440]) {
    test(`Studio layout stays stable at ${width}px`, async ({
        page,
        app,
    }, info) => {
        await page.setViewportSize({ width, height: 1080 });
        const longTeam = {
            ...team("LONG"),
            shortName: "Long Team Name ".repeat(8).trim(),
        };
        await page.route("**/api/admin/teamView/teams", (route) =>
            route.fulfill({ json: [...teams, longTeam] }),
        );
        await page.goto(app.url + "/admin/teamview");
        const toggle = studioToggle(page).locator("xpath=ancestor::label");
        const anchor = await documentBounds(toggle);
        const toolbar = page.getByRole("group", {
            name: "Team View controls",
            exact: true,
        });
        for (const layout of ["PVP", "SplitScreen", "Single"]) {
            await page
                .getByRole("button", { name: layout, exact: true })
                .click();
            expect(await documentBounds(toggle)).toEqual(anchor);
            await expect(
                toolbar.getByRole("button", { name: /^(Show|Hide) / }),
            ).toHaveCount(0);
        }
        await studioToggle(page).check();
        const card = page.getByRole("group", {
            name: "Single position",
            exact: true,
        });
        const search = page.getByRole("textbox", { name: "Search teams" });
        const geometry = async () => ({
            toggle: await documentBounds(toggle),
            card: await documentBounds(card),
            search: await documentBounds(search),
        });
        const initial = await geometry();
        const pickLong = () =>
            page.getByRole("button", { name: /^LONG:/ }).click();
        await pickLong();
        await visibleToggle(page, "Single").check();
        await expect(
            card.getByText(longTeam.shortName, { exact: true }),
        ).toHaveAttribute("title", longTeam.shortName);
        expect(await geometry()).toEqual(initial);
        await page.screenshot({
            path: info.outputPath(`studio-${width}.png`),
            fullPage: true,
            animations: "disabled",
        });
        await page.getByRole("button", { name: "Discard changes" }).click();
        expect(await geometry()).toEqual(initial);
        await pickLong();
        let release!: () => void;
        app.mutationGate = new Promise((resolve) => {
            release = resolve;
        });
        await applyButton(page).click();
        try {
            await expect(studioToggle(page)).toBeDisabled();
            expect(await geometry()).toEqual(initial);
        } finally {
            release();
        }
        await expect(applyButton(page)).toBeDisabled();
        await expect(studioToggle(page)).toBeEnabled();
        expect(await geometry()).toEqual(initial);
    });
}

test("pending team switches keep unrelated controls visually stable", async ({
    page,
    app,
}) => {
    await page.goto(app.url + "/admin/teamview");
    const peer = pick(page, "C");
    const original = await peer.elementHandle();
    const appearance = (locator: Locator) =>
        locator.evaluate((node) => {
            const style = getComputedStyle(node),
                box = node.getBoundingClientRect();
            return {
                color: style.color,
                background: style.backgroundColor,
                opacity: style.opacity,
                transform: style.transform,
                width: box.width,
                height: box.height,
            };
        });
    const before = await appearance(peer);
    const selectedMedia = mainMedia(page, "camera");
    const mediaBefore = await appearance(selectedMedia);
    const unavailable = mainMedia(page, "record");
    const unavailableBefore = await appearance(unavailable);
    const info = option(page, "TimeLine");
    const infoBefore = await appearance(info);
    let release!: () => void;
    app.mutationGate = new Promise((resolve) => {
        release = resolve;
    });
    await pick(page, "B").click();
    try {
        await expect(peer).toBeDisabled();
        await expect(selectedMedia).toBeDisabled();
        await page.waitForTimeout(250);
        expect(await appearance(peer)).toEqual(before);
        expect(await appearance(selectedMedia)).toEqual(mediaBefore);
        expect(await appearance(unavailable)).toEqual(unavailableBefore);
        expect(await appearance(info)).toEqual(infoBefore);
        expect(
            await peer.evaluate(
                (node, previous) => node === previous,
                original,
            ),
        ).toBe(true);
        await expect(
            pick(page, "B").locator(".MuiTouchRipple-root"),
        ).toHaveCount(0);
    } finally {
        release();
    }
    await expect.poll(() => app.state.SINGLE.settings.teamId).toBe("B");
    await expect(peer).toBeEnabled();
    expect(await appearance(peer)).toEqual(before);
    const titles = page.getByRole("heading");
    await expect(titles.filter({ hasText: "Teams · Single" })).toBeVisible();
    await expect(titles.filter({ hasText: "Settings · Single" })).toBeVisible();
    await studioToggle(page).check();
    await expect(titles.filter({ hasText: "Teams · Single" })).toBeVisible();
    await expect(titles.filter({ hasText: "Settings · Single" })).toBeVisible();
    await pick(page, "C").click();
    await expect(pick(page, "C").locator(".MuiTouchRipple-root")).toHaveCount(
        0,
    );
    await page
        .getByRole("button", { name: "Target Single", exact: true })
        .click();
    await expect(
        page
            .getByRole("button", { name: "Target Single", exact: true })
            .locator(".MuiTouchRipple-root"),
    ).toHaveCount(0);
});
