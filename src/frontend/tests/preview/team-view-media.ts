import { previewTeams } from "./team-view-data.ts";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, stat, rename } from "node:fs/promises";
import { join } from "node:path";

export const preparePreviewMedia = async (cache: string) => {
    const filters = previewTeams
        .map(({ id, shortName }, index) =>
            ["camera", "screen"].map((role) => ({
                name: `${id}-${role}.webm`,
                source: `${role === "camera" ? "testsrc2" : "testsrc"}=size=640x360:rate=20:duration=6`,
                filter: `hue=h=${index * 45},drawbox=x=0:y=0:w=iw:h=74:color=black@0.75:t=fill,drawtext=text='${shortName}  ${role.toUpperCase()}':fontcolor=white:fontsize=30:x=24:y=18,drawtext=text='FRAME %{n}':fontcolor=white:fontsize=24:x=24:y=h-45`,
            })),
        )
        .flat();
    const version = createHash("sha256")
        .update(JSON.stringify(filters))
        .digest("hex")
        .slice(0, 12);
    const directory = join(cache, version);
    await mkdir(directory, { recursive: true });
    for (const { name, source, filter } of filters) {
        const file = join(directory, name);
        try {
            await stat(file);
            continue;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        console.log(`Generating preview video ${name}`);
        const pending = `${file}.${process.pid}.pending.webm`;
        await new Promise<void>((resolve, reject) => {
            const process = spawn(
                "ffmpeg",
                [
                    "-nostdin",
                    "-v",
                    "error",
                    "-y",
                    "-f",
                    "lavfi",
                    "-i",
                    source,
                    "-vf",
                    filter,
                    "-an",
                    "-c:v",
                    "libvpx",
                    "-b:v",
                    "450k",
                    "-deadline",
                    "realtime",
                    "-cpu-used",
                    "8",
                    "-threads",
                    "1",
                    pending,
                ],
                { stdio: "inherit" },
            );
            process.on("error", reject);
            process.on("exit", (code) =>
                code === 0
                    ? resolve()
                    : reject(new Error(`FFmpeg failed for ${name}: ${code}`)),
            );
        });
        await rename(pending, file);
    }
    return { directory, url: `/preview-media/${version}` };
};
