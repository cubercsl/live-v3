import {
    createServer,
    type IncomingMessage,
    type ServerResponse,
} from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createPreviewData } from "./preview/team-view-data.ts";
import { installTeamViewPreview } from "./preview/team-view-browser.ts";
import { preparePreviewMedia } from "./preview/team-view-media.ts";
import { previewShell } from "./preview/team-view-shell.ts";

const frontend = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.argv[2] ?? "28090");
const media = await preparePreviewMedia(
    resolve(frontend, "../../.cache/team-view-preview-media"),
);
const fixture = createPreviewData(media.url);
const mock = `(${installTeamViewPreview.toString()})(${JSON.stringify(fixture).replaceAll("<", "\\u003c")});`;
const mime: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webm": "video/webm",
};
const send = (
    request: IncomingMessage,
    response: ServerResponse,
    content: Buffer,
    type: string,
) => {
    const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if (range) {
        const start = Number(range[1]),
            end = range[2]
                ? Math.min(Number(range[2]), content.length - 1)
                : content.length - 1;
        if (start > end || start >= content.length) {
            response.writeHead(416, {
                "Content-Range": `bytes */${content.length}`,
            });
            response.end();
            return;
        }
        response.writeHead(206, {
            "Content-Type": type,
            "Accept-Ranges": "bytes",
            "Content-Range": `bytes ${start}-${end}/${content.length}`,
            "Content-Length": end - start + 1,
        });
        response.end(content.subarray(start, end + 1));
    } else {
        response.writeHead(200, {
            "Content-Type": type,
            "Content-Length": content.length,
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-cache",
        });
        response.end(content);
    }
};
const server = createServer(async (req, res) => {
    try {
        const path = new URL(req.url!, `http://127.0.0.1:${port}`).pathname;
        if (path === "/") {
            send(req, res, Buffer.from(previewShell), mime[".html"]);
            return;
        }
        let directory: string, relative: string;
        if (path.startsWith(`${media.url}/`)) {
            directory = media.directory;
            relative = path.slice(media.url.length + 1);
        } else {
            const [, section, ...parts] = path.split("/");
            if (section !== "admin" && section !== "overlay") {
                res.writeHead(404);
                res.end("Not found");
                return;
            }
            directory = resolve(
                frontend,
                section === "admin" ? "admin-overlay/build" : "overlay/build",
            );
            relative = extname(parts.join("/"))
                ? parts.join("/")
                : "index.html";
        }
        const file = resolve(directory, decodeURIComponent(relative));
        if (!file.startsWith(directory + sep)) {
            res.writeHead(404);
            res.end("Not found");
            return;
        }
        let content = await readFile(file);
        if (relative === "index.html")
            content = Buffer.from(
                content
                    .toString()
                    .replace("<head>", `<head><script>${mock}</script>`),
            );
        send(
            req,
            res,
            content,
            mime[extname(file)] ?? "application/octet-stream",
        );
    } catch (error) {
        const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
        res.writeHead(missing ? 404 : 500);
        res.end(missing ? "Not found" : String(error));
        if (!missing) console.error(error);
    }
});
server.listen(port, "127.0.0.1", () => {
    const address = server.address();
    if (!address || typeof address === "string")
        throw new Error("Missing preview address");
    console.log(
        `Interactive Team View and video preview: http://127.0.0.1:${address.port}/`,
    );
    console.log(
        "Add ?failSaves=1 to preview failed submissions. Each tab has independent state.",
    );
});
