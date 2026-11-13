export const previewGroups = {
    teamView: ["SINGLE"],
    teamPVP: ["PVP_TOP", "PVP_BOTTOM"],
    splitScreen: ["TOP_LEFT", "TOP_RIGHT", "BOTTOM_LEFT", "BOTTOM_RIGHT"],
};

export const previewTeams = [
    {
        id: "57",
        name: "Massachusetts Institute of Technology",
        shortName: "MIT",
    },
    { id: "86", name: "Stanford University", shortName: "Stanford" },
    { id: "109", name: "University of Cambridge", shortName: "Cambridge" },
    { id: "119", name: "University of Oxford", shortName: "Oxford" },
    { id: "126", name: "University of Waterloo", shortName: "U Waterloo" },
    {
        id: "15",
        name: "Carnegie Mellon University",
        shortName: "Carnegie Mellon",
    },
];

export const createPreviewData = (mediaRoot: string) => {
    const teams = previewTeams.map(({ id, name, shortName }, index) => {
        const card = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" rx="24" fill="#174582"/><text x="320" y="155" text-anchor="middle" fill="white" font-family="sans-serif" font-size="42">${shortName}</text><text x="320" y="220" text-anchor="middle" fill="#ffd166" font-family="sans-serif" font-size="28">First to solve A</text></svg>`;
        return {
            id,
            name,
            shortName,
            groups: [],
            customFields: {},
            isHidden: false,
            isOutOfContest: false,
            medias: {
                camera: [
                    { type: "Video", url: `${mediaRoot}/${id}-camera.webm` },
                ],
                ...(index === 5
                    ? {}
                    : {
                          screen: [
                              {
                                  type: "Video",
                                  url: `${mediaRoot}/${id}-screen.webm`,
                              },
                          ],
                      }),
                achievement: [
                    {
                        type: "Image",
                        url: `data:image/svg+xml,${encodeURIComponent(card)}`,
                    },
                ],
            },
        };
    });
    return {
        storageKey: `teamView.preview.${mediaRoot.split("/").at(-1)}`,
        teams,
        groups: previewGroups,
        defaults: Object.fromEntries(
            Object.values(previewGroups)
                .flat()
                .map((position, index) => [
                    position,
                    {
                        shown: position === "SINGLE",
                        settings: {
                            teamId: teams[index % teams.length].id,
                            mediaTypes:
                                index % 2
                                    ? ["camera", null]
                                    : ["screen", "camera"],
                            showTaskStatus: true,
                            showAchievement: false,
                            showTimeLine: false,
                            position,
                        },
                    },
                ]),
        ),
        contest: {
            name: "Team View preview",
            teams,
            status: {
                type: "running",
                startedAtUnixMs: Date.now() - 3_600_000,
            },
            resultType: "ICPC",
            contestLengthMs: 18_000_000,
            freezeTimeMs: 14_400_000,
            problems: ["A", "B", "C"].map((id, ordinal) => ({
                id,
                letter: id,
                name: `Problem ${id}`,
                ordinal,
                isHidden: false,
                color: ["#e76f51", "#2a9d8f", "#e9c46a"][ordinal],
                minScore: null,
                maxScore: null,
                weight: 1,
                ftsMode: "normal",
                scoreMergeMode: null,
            })),
            groups: [],
            organizations: [],
            languages: [],
            awardsSettings: [],
            customFields: {},
            persons: [],
            accounts: [],
            penaltyPerWrongAttemptSeconds: 1200,
            penaltyRoundingMode: "each_submission_down_to_minute",
            emulationSpeed: 1,
        },
        scoreboard: {
            order: teams.map((team) => team.id),
            ranks: teams.map((_, index) => index + 1),
            awards: [],
            rows: Object.fromEntries(
                teams.map((team, index) => [
                    team.id,
                    {
                        totalScore: 3 - (index % 3),
                        penalty: 20 + index * 10,
                        lastAcceptedMs: 1_800_000,
                        problemResults: [0, 1, 2].map((problem) => ({
                            type: "ICPC",
                            wrongAttempts: index % 2,
                            pendingAttempts: 0,
                            isSolved: problem < 3 - (index % 3),
                            isFirstToSolve: index === 0,
                            lastSubmitTimeMs: (problem + 1) * 600_000,
                        })),
                    },
                ]),
            ),
        },
    };
};
export type PreviewData = ReturnType<typeof createPreviewData>;
