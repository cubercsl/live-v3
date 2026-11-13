import type { PreviewData } from "./team-view-data.ts";

export const installTeamViewPreview = (fixture: PreviewData) => {
    const key = fixture.storageKey;
    type State = { positions: PreviewData["defaults"]; action: string };
    if (sessionStorage.getItem(key) === null) {
        sessionStorage.removeItem("teamView.studio");
        sessionStorage.removeItem("teamView.selection");
        sessionStorage.setItem(
            key,
            JSON.stringify({ positions: fixture.defaults, action: "" }),
        );
    }
    const state = (): State => JSON.parse(sessionStorage.getItem(key)!);
    const locations: Record<string, string> = {
        SINGLE: "teamViewSingle",
        PVP_TOP: "teamViewPvpTop",
        PVP_BOTTOM: "teamViewPvpBottom",
        TOP_LEFT: "teamViewTopLeft",
        TOP_RIGHT: "teamViewTopRight",
        BOTTOM_LEFT: "teamViewBottomLeft",
        BOTTOM_RIGHT: "teamViewBottomRight",
    };
    const widgets = () =>
        Object.entries(state().positions)
            .filter(([, slot]) => slot.shown)
            .map(([position, slot], index) => {
                const settings = slot.settings;
                const team =
                    settings.teamId === null
                        ? fixture.teams[0]
                        : fixture.teams.find(
                              (team) => team.id === settings.teamId,
                          )!;
                const media = (type: string | null) =>
                    type === null ? [] : (team.medias[type] ?? []);
                return {
                    showOrder: index + 1,
                    widget: {
                        type: "TeamViewWidget",
                        widgetId: locations[position],
                        widgetLocationId: locations[position],
                        statisticsId: "teamView",
                        settings: {
                            teamId: team.id,
                            primary: media(settings.mediaTypes[0] ?? null),
                            secondary: media(settings.mediaTypes[1] ?? null),
                            achievement: settings.showAchievement
                                ? team.medias.achievement
                                : [],
                            showTaskStatus: settings.showTaskStatus,
                            showTimeLine: settings.showTimeLine,
                            position,
                        },
                    },
                };
            });
    const sockets = new Set<PreviewSocket>();
    class PreviewSocket extends EventTarget {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;
        readyState = 0;
        url: string;
        onopen: ((event: Event) => void) | null = null;
        onclose: ((event: Event) => void) | null = null;
        onmessage: ((event: MessageEvent) => void) | null = null;
        constructor(url: string | URL) {
            super();
            this.url = String(url);
            sockets.add(this);
            queueMicrotask(() => {
                if (this.readyState !== 0) return;
                this.readyState = 1;
                const event = new Event("open");
                this.onopen?.(event);
                this.dispatchEvent(event);
                const path = new URL(this.url).pathname;
                if (path.endsWith("/mainScreen"))
                    this.message({
                        type: "MainScreenSnapshot",
                        widgets: widgets(),
                    });
                else if (path.endsWith("/contestInfo"))
                    this.message(fixture.contest);
                else if (path.includes("/scoreboard/"))
                    this.message(fixture.scoreboard);
                else if (path.includes("/teamRuns/")) this.message([]);
                else if (path.endsWith("/queue"))
                    this.message({ type: "QueueSnapshot", infos: [] });
                else if (path.endsWith("/ticker"))
                    this.message({ type: "TickerSnapshot", messages: [] });
            });
        }
        message(value: unknown, raw = false) {
            if (this.readyState !== 1) return;
            const event = new MessageEvent("message", {
                data: raw ? value : JSON.stringify(value),
            });
            this.onmessage?.(event);
            this.dispatchEvent(event);
        }
        close() {
            this.readyState = 3;
            sockets.delete(this);
            const event = new Event("close");
            this.onclose?.(event);
            this.dispatchEvent(event);
        }
        send() {}
    }
    window.WebSocket = PreviewSocket as unknown as typeof WebSocket;
    const publish = () => {
        for (const socket of sockets) {
            if (socket.url.endsWith("/mainScreen"))
                socket.message({
                    type: "MainScreenSnapshot",
                    widgets: widgets(),
                });
            if (socket.url.endsWith("/adminActions") && state().action)
                socket.message(state().action, true);
        }
    };
    // sessionStorage events synchronize the real admin/overlay frames within
    // this tab without sharing drafts or simulated output with another tab.
    window.addEventListener("storage", (event) => {
        if (event.key === key) publish();
    });
    const fetchResource = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
        const request = new Request(input, init);
        const path = new URL(request.url).pathname;
        if (!path.startsWith("/api/")) return fetchResource(input, init);
        const response = (value: unknown, status = 200) =>
            new Response(JSON.stringify(value), {
                status,
                headers: { "Content-Type": "application/json" },
            });
        const [, , scope, group, position, action] = path.split("/");
        if (scope === "overlay" && group === "visualConfig.json")
            return response({
                CONTEST_COLOR: "#0a4497",
                CONTEST_NAME: "Team View preview",
            });
        if (scope !== "admin" || !(group in fixture.groups))
            return response(
                {
                    status: "error",
                    message: `Unknown preview endpoint: ${path}`,
                },
                404,
            );
        const positions: string[] = fixture.groups[group];
        if (request.method === "POST") {
            await new Promise((resolve) => setTimeout(resolve, 350));
            if (new URLSearchParams(location.search).has("failSaves"))
                return response(
                    { status: "error", message: "Preview save failure" },
                    500,
                );
            const next = state();
            if (position === "apply" || position === "show_with_settings") {
                const body = await request.json();
                if (
                    JSON.stringify(Object.keys(body).sort()) !==
                    JSON.stringify([...positions].sort())
                )
                    return response(
                        { status: "error", message: "Incomplete layout" },
                        400,
                    );
                for (const id of positions)
                    next.positions[id] =
                        position === "apply"
                            ? body[id]
                            : { settings: body[id], shown: true };
            } else if (positions.includes(position)) {
                if (!action || action === "show_with_settings")
                    next.positions[position].settings = await request.json();
                if (action === "show" || action === "show_with_settings")
                    next.positions[position].shown = true;
                if (action === "hide") next.positions[position].shown = false;
            } else
                return response(
                    { status: "error", message: "Unknown preview action" },
                    404,
                );
            next.action = path;
            sessionStorage.setItem(key, JSON.stringify(next));
            publish();
            return response({ status: "ok" });
        }
        if (position === "teams") return response(fixture.teams);
        if (position === "usage_stats")
            return response({ type: "per_team", byTeam: {} });
        if (!position)
            return response(
                Object.fromEntries(
                    positions.map((id) => [id, state().positions[id]]),
                ),
            );
        return response(
            { status: "error", message: "Unknown preview resource" },
            404,
        );
    };
};
