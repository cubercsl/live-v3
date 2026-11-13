import { test as base, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const test = base.extend<{ preview: string }>({
    preview: async ({}, use) => {
        const child = spawn(
            process.execPath,
            [
                fileURLToPath(
                    new URL("../team-view-preview.ts", import.meta.url),
                ),
                "0",
            ],
            { stdio: ["ignore", "pipe", "pipe"] },
        );
        const ready = new Promise<string>((resolve, reject) => {
            let output = "";
            child.stdout.on("data", (data) => {
                process.stdout.write(data);
                output += data.toString();
                const match = output.match(
                    /Interactive Team View and video preview: (http:\/\/127\.0\.0\.1:\d+\/)/,
                );
                if (match) resolve(match[1]);
            });
            child.stderr.on("data", (data) => process.stderr.write(data));
            child.on("error", reject);
            child.on("exit", (code) =>
                reject(new Error(`Preview exited: ${code}`)),
            );
        });
        try {
            await use(await ready);
        } finally {
            if (child.exitCode === null) {
                const exited = once(child, "exit");
                child.kill("SIGTERM");
                await exited;
            }
        }
    },
});

test("video preview follows immediate edits and Studio Apply with tab-local output", async ({
    page,
    context,
    preview,
}, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(preview);
    const controls = page.frameLocator("#controls"),
        program = page.frameLocator("#program");
    await expect(program.locator('[data-teamid="57"]')).toBeVisible();
    await expect
        .poll(() =>
            program
                .locator("video")
                .first()
                .evaluate((video: HTMLVideoElement) => video.currentTime),
        )
        .toBeGreaterThan(0);
    await controls.getByRole("button", { name: /^86:/ }).click();
    await expect(program.locator('[data-teamid="86"]')).toBeVisible();
    await expect(program.locator('[data-teamid="57"]')).toHaveCount(0);
    await controls.getByRole("switch", { name: "Studio", exact: true }).check();
    await controls.getByRole("button", { name: /^109:/ }).click();
    await controls
        .getByRole("group", { name: "Main content", exact: true })
        .getByRole("button", { name: "camera", exact: true })
        .click();
    await expect(program.locator('[data-teamid="86"]')).toBeVisible();
    await expect(program.locator('[data-teamid="109"]')).toHaveCount(0);
    await page.screenshot({
        path: info.outputPath("video-studio-draft.png"),
        fullPage: true,
        animations: "disabled",
    });
    await controls.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(program.locator('[data-teamid="109"]')).toBeVisible();
    await expect(program.locator('[data-teamid="86"]')).toHaveCount(0);
    await expect(program.locator("video")).toHaveCount(1);
    await expect(program.locator("video")).toHaveAttribute(
        "src",
        /109-camera\.webm$/,
    );
    await controls.getByRole("button", { name: /^57:/ }).click();
    await controls.getByRole("button", { name: "Discard changes" }).click();
    await expect(program.locator('[data-teamid="109"]')).toBeVisible();
    await page.reload();
    await expect(program.locator('[data-teamid="109"]')).toBeVisible();
    const second = await context.newPage();
    await second.goto(preview);
    await expect(
        second.frameLocator("#program").locator('[data-teamid="57"]'),
    ).toBeVisible();
    await expect(program.locator('[data-teamid="109"]')).toBeVisible();
    await second.close();
    const visible = controls
        .getByRole("group", { name: "Single position", exact: true })
        .getByRole("switch", { name: "Visible", exact: true });
    await visible.uncheck();
    await expect(program.locator("video")).toHaveCount(1);
    await controls.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(program.locator("video")).toHaveCount(0);
    expect(errors).toEqual([]);
});

test("failed preview submissions retain the live video", async ({
    page,
    preview,
}) => {
    await page.goto(preview + "?failSaves=1");
    const controls = page.frameLocator("#controls"),
        program = page.frameLocator("#program");
    await expect(program.locator('[data-teamid="57"]')).toBeVisible();
    await controls.getByRole("switch", { name: "Studio", exact: true }).check();
    await controls.getByRole("button", { name: /^86:/ }).click();
    await controls.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(
        controls.getByText("Failed to save /teamView", { exact: true }),
    ).toBeVisible();
    await expect(program.locator('[data-teamid="57"]')).toBeVisible();
    await expect(program.locator('[data-teamid="86"]')).toHaveCount(0);
    await expect(
        controls.getByRole("button", { name: "Apply", exact: true }),
    ).toBeEnabled();
});
