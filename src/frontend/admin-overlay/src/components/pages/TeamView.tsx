import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    Box,
    Button,
    ButtonBase,
    Chip,
    Container,
    FormLabel,
    FormControlLabel,
    Switch,
    Grid,
    Paper,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from "@mui/material";
import SingleTeamViewIcon from "@mui/icons-material/WebAsset";
import PVPTeamViewIcon from "@mui/icons-material/Splitscreen";
import SplitTeamViewIcon from "@mui/icons-material/GridView";
import { TeamTable, TeamViewData } from "../TeamTable";
import TeamMediaSwitcher, {
    DEFAULT_MEDIA_TYPES,
} from "../controls/TeamMediaSwitcher";
import ShowPresetButton from "../controls/ShowPresetButton";
import {
    ExternalTeamViewSettings,
    TeamId,
    TeamInfo,
    TeamMediaType,
    TeamViewPosition,
    TeamViewPositionState,
} from "@shared/api";
import {
    CommonTeamViewInstancesState,
    TeamViewContentType,
    TeamViewWidgetService,
    useTeamViewWidgetService,
    useTeamViewWidgetUsageStats,
} from "@admin/services/teamViewService";

const POSITIONS = {
    single: [TeamViewPosition.SINGLE],
    pvp: [TeamViewPosition.PVP_TOP, TeamViewPosition.PVP_BOTTOM],
    split: [
        TeamViewPosition.TOP_LEFT,
        TeamViewPosition.TOP_RIGHT,
        TeamViewPosition.BOTTOM_LEFT,
        TeamViewPosition.BOTTOM_RIGHT,
    ],
} satisfies Record<TeamViewContentType, TeamViewPosition[]>;
const POSITION_NAMES: Record<TeamViewPosition, string> = {
    SINGLE: "Single",
    PVP_TOP: "Top",
    PVP_BOTTOM: "Bottom",
    TOP_LEFT: "Top left",
    TOP_RIGHT: "Top right",
    BOTTOM_LEFT: "Bottom left",
    BOTTOM_RIGHT: "Bottom right",
};
const SELECTION_KEY = "teamView.selection";
type Selection = {
    variant: TeamViewContentType | null;
    positions: Record<TeamViewContentType, TeamViewPosition>;
    search: string;
};
type LayoutState = Partial<Record<TeamViewPosition, TeamViewPositionState>>;
type Studio = {
    enabled: Record<TeamViewContentType, boolean>;
    drafts: Partial<Record<TeamViewContentType, LayoutState>>;
};
const sameState = (a: TeamViewPositionState, b: TeamViewPositionState) =>
    a.shown === b.shown &&
    a.settings.teamId === b.settings.teamId &&
    JSON.stringify(a.settings.mediaTypes) ===
        JSON.stringify(b.settings.mediaTypes) &&
    a.settings.showTaskStatus === b.settings.showTaskStatus &&
    a.settings.showAchievement === b.settings.showAchievement &&
    a.settings.showTimeLine === b.settings.showTimeLine;
const settingsSummary = (settings: ExternalTeamViewSettings) =>
    [
        settings.mediaTypes?.map((media) => media ?? "empty").join(" + "),
        `Info: ${settings.showTaskStatus ? "on" : "off"}`,
        `Achievements: ${settings.showAchievement ? "on" : "off"}`,
        `Timeline: ${settings.showTimeLine ? "on" : "off"}`,
    ].join(" · ");
const useSessionState = <T,>(key: string, initial: () => T) => {
    const [value, setValue] = useState<T>(() => {
        const stored = sessionStorage.getItem(key);
        return stored === null ? initial() : JSON.parse(stored);
    });
    useEffect(() => {
        sessionStorage.setItem(key, JSON.stringify(value));
    }, [key, value]);
    return [value, setValue] as const;
};
const useSelection = () =>
    useSessionState<Selection>(SELECTION_KEY, () => ({
        variant: null,
        positions: {
            single: TeamViewPosition.SINGLE,
            pvp: TeamViewPosition.PVP_TOP,
            split: TeamViewPosition.TOP_LEFT,
        },
        search: "",
    }));
const useStudio = () =>
    useSessionState<Studio>("teamView.studio", () => ({
        enabled: { single: false, pvp: false, split: false },
        drafts: {},
    }));

const teamName = (teams: TeamInfo[], id: TeamId | null | undefined) =>
    id == null
        ? "Automode"
        : (teams.find((team) => team.id === id)?.shortName ?? id);

const PositionSummary = ({
    team,
    settings,
    studio,
    changed,
}: {
    team: string;
    settings: ExternalTeamViewSettings;
    studio: boolean;
    changed: boolean;
}) => {
    const summary = settingsSummary(settings);
    return (
        <Box
            role="group"
            aria-label={
                studio ? "Draft configuration" : "Current configuration"
            }
            sx={{ minWidth: 0 }}
        >
            <Typography
                variant="body2"
                noWrap
                title={team}
                color={changed ? "primary" : "text.primary"}
                sx={{ lineHeight: "20px", fontWeight: 600 }}
            >
                {team}
            </Typography>
            <Typography
                component="div"
                variant="caption"
                title={summary}
                color={changed ? "primary" : "text.secondary"}
                sx={{
                    height: 36,
                    lineHeight: "18px",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    overflowWrap: "anywhere",
                }}
            >
                {summary}
            </Typography>
        </Box>
    );
};

interface PositionSettingsProps {
    settings: ExternalTeamViewSettings;
    teams: TeamInfo[];
    variant: TeamViewContentType;
    pending: boolean;
    onChange: (patch: Partial<ExternalTeamViewSettings>) => void;
}
const PositionSettings: React.FC<PositionSettingsProps> = ({
    settings,
    teams,
    variant,
    pending,
    onChange,
}) => {
    const selectedTeam = teams.find((team) => team.id === settings.teamId);
    const disabledMedia = DEFAULT_MEDIA_TYPES.filter(
        (media) =>
            media !== null &&
            (selectedTeam
                ? !selectedTeam.medias[media]?.length
                : !teams.some((team) => team.medias[media]?.length)),
    );
    const mediaTypes = settings.mediaTypes ?? [];
    const changeMedia = (index: number, media: TeamMediaType | null) => {
        const next = [mediaTypes[0] ?? null, mediaTypes[1] ?? null];
        next[index] = media;
        if (index === 0 && media !== null && media === next[1]) next[1] = null;
        onChange({ mediaTypes: next });
    };
    return (
        <Stack spacing={2}>
            {["Main content", "Additional content"].map((label, index) => (
                <Box role="group" aria-label={label} key={label}>
                    <FormLabel sx={{ display: "block", mb: 1 }}>
                        {label}
                    </FormLabel>
                    <TeamMediaSwitcher
                        switchedMediaType={mediaTypes[index] ?? null}
                        onSwitch={(media) => changeMedia(index, media)}
                        pending={pending}
                        disabledMediaTypes={
                            index === 0
                                ? disabledMedia
                                : [...disabledMedia, mediaTypes[0]].filter(
                                      (media) => media != null,
                                  )
                        }
                    />
                </Box>
            ))}
            {[
                {
                    key: "showTaskStatus" as const,
                    label: "Name, ranking, submissions",
                    visible: true,
                    checked: settings.showTaskStatus ?? true,
                },
                {
                    key: "showAchievement" as const,
                    label: "Achievements",
                    visible: variant !== "split",
                    checked: settings.showAchievement ?? false,
                },
                {
                    key: "showTimeLine" as const,
                    label: "TimeLine",
                    visible: variant !== "split",
                    checked: settings.showTimeLine ?? false,
                },
            ]
                .filter((option) => option.visible)
                .map((option) => (
                    <Stack
                        key={option.key}
                        role="group"
                        aria-label={option.label}
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                    >
                        <FormLabel>{option.label}</FormLabel>
                        <ShowPresetButton
                            checked={option.checked}
                            disabled={pending}
                            sx={{
                                "&.Mui-disabled": {
                                    color: option.checked
                                        ? "error.main"
                                        : "primary.main",
                                },
                            }}
                            onClick={(value) =>
                                onChange({ [option.key]: value })
                            }
                        />
                    </Stack>
                ))}
        </Stack>
    );
};

interface WorkspaceProps {
    status: CommonTeamViewInstancesState;
    setStatus: React.Dispatch<
        React.SetStateAction<CommonTeamViewInstancesState>
    >;
    teams: TeamInfo[];
    services: Record<TeamViewContentType, TeamViewWidgetService>;
    usageStats: ReturnType<typeof useTeamViewWidgetUsageStats>;
}
const TeamViewWorkspace: React.FC<WorkspaceProps> = ({
    status,
    setStatus,
    teams,
    services,
    usageStats,
}) => {
    const [selection, setSelection] = useSelection();
    const [studioState, setStudioState] = useStudio();
    const [pending, setPending] = useState<Set<TeamViewPosition>>(new Set());
    const inFlight = useRef(new Set<TeamViewPosition>());
    const shownPosition = Object.values(TeamViewPosition).find(
        (position) => status[position].shown,
    );
    const initialVariant: TeamViewContentType =
        !shownPosition || shownPosition === TeamViewPosition.SINGLE
            ? "single"
            : shownPosition.startsWith("PVP")
              ? "pvp"
              : "split";
    const variant = selection.variant ?? initialVariant;
    if (selection.variant === null) setSelection({ ...selection, variant });
    const positions = POSITIONS[variant];
    const target = selection.positions[variant];
    const targetStatus = status[target];
    const studio = studioState.enabled[variant];
    const draft = studioState.drafts[variant];
    const effectiveSettings =
        studio && draft ? draft[target].settings : targetStatus.settings;
    const hasChanges =
        draft !== undefined &&
        positions.some(
            (position) => !sameState(draft[position], status[position]),
        );
    const snapshot = (): LayoutState =>
        Object.fromEntries(
            positions.map((position) => [
                position,
                {
                    settings: status[position].settings,
                    shown: status[position].shown,
                },
            ]),
        );
    const discard = () =>
        setStudioState((current) => ({
            ...current,
            drafts: Object.fromEntries(
                Object.entries(current.drafts).filter(
                    ([layout]) => layout !== variant,
                ),
            ),
        }));
    const editDraft = (
        position: TeamViewPosition,
        patch: Partial<TeamViewPositionState>,
    ) => {
        if (inFlight.current.has(position)) return;
        setStudioState((current) => {
            const layout = current.drafts[variant] ?? snapshot();
            const next = {
                ...layout,
                [position]: { ...layout[position], ...patch },
            };
            return {
                ...current,
                drafts: {
                    ...current.drafts,
                    [variant]: positions.some(
                        (slot) => !sameState(next[slot], status[slot]),
                    )
                        ? next
                        : undefined,
                },
            };
        });
    };
    const service = services[variant];
    const busy = pending.has(target);
    const groupBusy = positions.some((position) => pending.has(position));
    const visibleTeams = useMemo<TeamViewData[]>(() => {
        const search = selection.search.toLowerCase();
        return [
            {
                id: null,
                shortName: "Automode",
                medias: {},
                shown: Object.values(TeamViewPosition).some(
                    (position) =>
                        status[position].shown &&
                        status[position].settings.teamId == null,
                ),
                selected: effectiveSettings.teamId == null,
            },
            ...teams
                .filter((team) =>
                    `${team.id} ${team.shortName} ${team.name}`
                        .toLowerCase()
                        .includes(search),
                )
                .toSorted((a, b) => a.shortName.localeCompare(b.shortName))
                .map((team) => ({
                    id: team.id,
                    shortName: team.shortName,
                    medias: team.medias,
                    shown: Object.values(TeamViewPosition).some(
                        (position) =>
                            status[position].shown &&
                            status[position].settings.teamId === team.id,
                    ),
                    selected: effectiveSettings.teamId === team.id,
                })),
        ];
    }, [selection.search, status, effectiveSettings.teamId, teams]);

    const run = async (
        affected: TeamViewPosition[],
        action: () => Promise<boolean>,
        apply: (
            current: CommonTeamViewInstancesState,
        ) => CommonTeamViewInstancesState,
    ) => {
        if (affected.some((position) => inFlight.current.has(position)))
            return false;
        affected.forEach((position) => inFlight.current.add(position));
        setPending(new Set(inFlight.current));
        try {
            const success = await action();
            if (success) setStatus(apply);
            return success;
        } finally {
            affected.forEach((position) => inFlight.current.delete(position));
            setPending(new Set(inFlight.current));
        }
    };
    const save = (patch: Partial<ExternalTeamViewSettings>, show: boolean) => {
        const settings = { ...effectiveSettings, ...patch };
        if (studio) {
            editDraft(target, { settings });
            return;
        }
        return run(
            [target],
            () =>
                show
                    ? service.showWithSettings(target, settings)
                    : service.setSettings(target, settings),
            (current) => ({
                ...current,
                [target]: {
                    ...current[target],
                    settings,
                    shown: show || current[target].shown,
                },
            }),
        );
    };
    const visibility = (position: TeamViewPosition, shown: boolean) =>
        run(
            [position],
            () => (shown ? service.show(position) : service.hide(position)),
            (current) => ({
                ...current,
                [position]: { ...current[position], shown },
            }),
        );

    const apply = async () => {
        if (!draft || !hasChanges) return;
        const submitted = draft;
        const success = await run(
            positions,
            () => service.apply(submitted),
            (current) => ({
                ...current,
                ...Object.fromEntries(
                    positions.map((position) => [
                        position,
                        { ...current[position], ...submitted[position] },
                    ]),
                ),
            }),
        );
        if (success) discard();
    };

    return (
        <Stack spacing={2}>
            <Box
                role="group"
                aria-label="Team View controls"
                sx={{
                    display: "grid",
                    alignItems: "center",
                    gap: 1,
                    gridTemplateColumns: {
                        xs: "minmax(0, 1fr)",
                        sm: "minmax(0, 1fr) auto",
                        md: "minmax(0, 1fr) auto minmax(0, 1fr)",
                    },
                    gridTemplateAreas: {
                        xs: '"layouts" "studio" "actions"',
                        sm: '"layouts studio" "actions actions"',
                        md: '"layouts studio actions"',
                    },
                }}
            >
                <ToggleButtonGroup
                    sx={{ gridArea: "layouts", justifySelf: "start" }}
                    value={variant}
                    color="primary"
                    exclusive
                    size="small"
                    onChange={(_, next) =>
                        next &&
                        setSelection((current) => ({
                            ...current,
                            variant: next,
                        }))
                    }
                >
                    <ToggleButton value="single">
                        <SingleTeamViewIcon />
                        Single
                    </ToggleButton>
                    <ToggleButton value="pvp">
                        <PVPTeamViewIcon />
                        PVP
                    </ToggleButton>
                    <ToggleButton value="split">
                        <SplitTeamViewIcon />
                        SplitScreen
                    </ToggleButton>
                </ToggleButtonGroup>
                <FormControlLabel
                    sx={{
                        gridArea: "studio",
                        m: 0,
                        justifySelf: { xs: "start", sm: "end", md: "center" },
                    }}
                    label="Studio"
                    control={
                        <Switch
                            checked={studio}
                            disabled={groupBusy}
                            onChange={(_, checked) =>
                                setStudioState((current) => ({
                                    ...current,
                                    enabled: {
                                        ...current.enabled,
                                        [variant]: checked,
                                    },
                                }))
                            }
                        />
                    }
                />
                <Box
                    sx={{
                        gridArea: "actions",
                        minWidth: 0,
                        minHeight: 40,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: { xs: "flex-start", sm: "flex-end" },
                    }}
                >
                    {studio ? (
                        <Stack direction="row" spacing={1} alignItems="center">
                            <Typography
                                variant="body2"
                                color="text.secondary"
                                noWrap
                                sx={{ display: { xs: "none", lg: "block" } }}
                            >
                                {hasChanges
                                    ? "Unapplied changes"
                                    : "Up to date"}
                            </Typography>
                            <Button
                                variant="contained"
                                sx={{ minWidth: 100 }}
                                disabled={groupBusy || !hasChanges}
                                onClick={apply}
                            >
                                {groupBusy ? "Applying…" : "Apply"}
                            </Button>
                            <Button
                                disabled={groupBusy || !hasChanges}
                                onClick={discard}
                            >
                                Discard changes
                            </Button>
                        </Stack>
                    ) : hasChanges ? (
                        <Chip
                            size="small"
                            variant="outlined"
                            color="primary"
                            label="Draft saved"
                            title="Enable Studio to apply or discard saved changes"
                        />
                    ) : null}
                </Box>
            </Box>
            <Grid container spacing={1}>
                {positions.map((position) => {
                    const slot = status[position];
                    const selected = position === target;
                    const draftSlot = draft?.[position];
                    const changed =
                        studio &&
                        draftSlot !== undefined &&
                        !sameState(draftSlot, slot);
                    const displayed = studio ? (draftSlot ?? slot) : slot;
                    return (
                        <Grid
                            key={position}
                            size={{
                                xs: 12,
                                sm: positions.length === 1 ? 12 : 6,
                                lg: 12 / positions.length,
                            }}
                        >
                            <Paper
                                role="group"
                                aria-label={`${POSITION_NAMES[position]} position`}
                                variant="outlined"
                                sx={{
                                    height: "100%",
                                    borderWidth: 2,
                                    borderColor: selected
                                        ? "primary.main"
                                        : "divider",
                                    bgcolor: selected
                                        ? "action.selected"
                                        : "background.paper",
                                }}
                            >
                                <ButtonBase
                                    disableRipple
                                    aria-label={`Target ${POSITION_NAMES[position]}`}
                                    aria-pressed={selected}
                                    onClick={() =>
                                        setSelection((current) => ({
                                            ...current,
                                            positions: {
                                                ...current.positions,
                                                [variant]: position,
                                            },
                                        }))
                                    }
                                    sx={{
                                        display: "block",
                                        width: "100%",
                                        textAlign: "left",
                                        p: 1.5,
                                        "&.Mui-focusVisible": {
                                            outline: "2px solid",
                                            outlineColor: "primary.main",
                                            outlineOffset: -2,
                                        },
                                    }}
                                >
                                    <Stack
                                        direction="row"
                                        justifyContent="space-between"
                                        alignItems="center"
                                        gap={1}
                                    >
                                        <Typography
                                            fontWeight={600}
                                            noWrap
                                            sx={{ minWidth: 0 }}
                                        >
                                            {POSITION_NAMES[position]}
                                            {selected && " · Target"}
                                        </Typography>
                                        <Chip
                                            sx={{ flexShrink: 0 }}
                                            size="small"
                                            label={
                                                pending.has(position)
                                                    ? "Saving…"
                                                    : displayed.shown
                                                      ? studio
                                                          ? "Visible"
                                                          : "Live"
                                                      : "Hidden"
                                            }
                                            color={
                                                changed
                                                    ? "primary"
                                                    : !studio && slot.shown
                                                      ? "success"
                                                      : "default"
                                            }
                                        />
                                    </Stack>
                                    <Box sx={{ mt: 1 }}>
                                        <PositionSummary
                                            team={teamName(
                                                teams,
                                                displayed.settings.teamId,
                                            )}
                                            settings={displayed.settings}
                                            studio={studio}
                                            changed={changed}
                                        />
                                    </Box>
                                </ButtonBase>
                                <Stack
                                    direction="row"
                                    justifyContent="flex-end"
                                    sx={{
                                        px: 1,
                                        pb: 1,
                                        minHeight: 46,
                                        alignItems: "center",
                                    }}
                                >
                                    {studio ? (
                                        <FormControlLabel
                                            label="Visible"
                                            control={
                                                <Switch
                                                    checked={
                                                        (draftSlot ?? slot)
                                                            .shown
                                                    }
                                                    disabled={pending.has(
                                                        position,
                                                    )}
                                                    onChange={(_, shown) =>
                                                        editDraft(position, {
                                                            shown,
                                                        })
                                                    }
                                                />
                                            }
                                        />
                                    ) : (
                                        <>
                                            <Button
                                                size="small"
                                                disabled={
                                                    pending.has(position) ||
                                                    slot.shown
                                                }
                                                onClick={() =>
                                                    visibility(position, true)
                                                }
                                            >
                                                Show
                                            </Button>
                                            <Button
                                                size="small"
                                                color="error"
                                                disabled={
                                                    pending.has(position) ||
                                                    !slot.shown
                                                }
                                                onClick={() =>
                                                    visibility(position, false)
                                                }
                                            >
                                                Hide
                                            </Button>
                                        </>
                                    )}
                                </Stack>
                            </Paper>
                        </Grid>
                    );
                })}
            </Grid>
            <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 7 }}>
                    <Paper variant="outlined" sx={{ p: 2 }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>
                            Teams · {POSITION_NAMES[target]}
                        </Typography>
                        <TextField
                            fullWidth
                            size="small"
                            label="Search teams"
                            value={selection.search}
                            onChange={(event) =>
                                setSelection((current) => ({
                                    ...current,
                                    search: event.target.value,
                                }))
                            }
                        />
                        <Box
                            sx={{ maxHeight: "55vh", overflowY: "auto", mt: 1 }}
                        >
                            <TeamTable
                                teams={visibleTeams}
                                onTeamClick={(teamId) => save({ teamId }, true)}
                                disabled={busy}
                                maxColumns={2}
                                usageStats={usageStats}
                            />
                        </Box>
                    </Paper>
                </Grid>
                <Grid size={{ xs: 12, md: 5 }}>
                    <Paper variant="outlined" sx={{ p: 2 }} aria-busy={busy}>
                        <Typography variant="h6" sx={{ mb: 2 }}>
                            Settings · {POSITION_NAMES[target]}
                        </Typography>
                        <PositionSettings
                            settings={effectiveSettings}
                            teams={teams}
                            variant={variant}
                            pending={busy}
                            onChange={(patch) => save(patch, false)}
                        />
                    </Paper>
                </Grid>
            </Grid>
        </Stack>
    );
};

const TeamView: React.FC = () => {
    const [status, setStatus] = useState<CommonTeamViewInstancesState>({});
    const single = useTeamViewWidgetService("single", setStatus);
    const pvp = useTeamViewWidgetService("pvp", setStatus);
    const split = useTeamViewWidgetService("split", setStatus);
    const usageStats = useTeamViewWidgetUsageStats(single);
    const [teams, setTeams] = useState<TeamInfo[]>();
    useEffect(() => {
        single.teams().then(setTeams);
    }, [single]);
    return (
        <Container maxWidth="xl" sx={{ py: 2 }}>
            {Object.keys(status).length !== 7 || teams === undefined ? (
                <Box>Loading team views…</Box>
            ) : (
                <TeamViewWorkspace
                    status={status}
                    setStatus={setStatus}
                    teams={teams}
                    services={{ single, pvp, split }}
                    usageStats={usageStats}
                />
            )}
        </Container>
    );
};

export default TeamView;
