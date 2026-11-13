import React, {
    useEffect,
    useLayoutEffect,
    useState,
    useCallback,
} from "react";
import styled, { Keyframes, keyframes } from "styled-components";
import c from "../../../config";
import { OverlayTeamViewSettings, TeamViewPosition, Widget } from "@shared/api";
import {
    OverlayWidgetC,
    OverlayWidgetProps,
} from "@/components/organisms/widgets/types";
import { TeamViewMedia, useTeamViewMedia } from "../holder/TeamViewMedia";
import TimeLine, {
    TimeLineBackground,
} from "@/components/organisms/holder/TimeLine";
import { ContestantViewCorner } from "@/components/molecules/info/ContestantViewCorner";
import { ContestantViewLine } from "@/components/molecules/info/ContestantViewLine";
import { LocationRectangle } from "@/utils/location-rectangle";

const slideIn = keyframes`
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
`;

const slideOut = keyframes`
    from {
        opacity: 1;
    }
    to {
        opacity: 0;
    }
`;

const RoundedTeamMediaHolder = styled(TeamViewMedia)`
    border-radius: ${c.GLOBAL_BORDER_RADIUS};
    border-top-right-radius: 0;
`;

const TeamViewContainer = styled.div.attrs({
    className: "TeamViewContainer",
})<{ show: boolean; animation?: Keyframes; animationStyle: string }>`
    width: 100%;
    height: 100%;
    display: ${(props) => (props.show ? "flex" : "none")};
    flex-direction: column;
    justify-content: start;
    align-items: flex-end;
    position: absolute;
    animation: ${(props) => props.animation} ${c.TEAM_VIEW_APPEAR_TIME}ms
        ${(props) => props.animationStyle};
    animation-fill-mode: forwards;
`;

type CommonContentProps = {
    location: LocationRectangle;
    position?: TeamViewPosition;
    media: ReturnType<typeof useTeamViewMedia>;
    audioEnabled: boolean;
} & OverlayTeamViewSettings;

const PrimaryMediaWrapper = styled.div`
    position: absolute;
    width: 100%;
    height: 100%;
    z-index: 1;
    overflow: hidden;
`;

interface AchievementWrapperProps {
    showTimeline: boolean;
}

const AchievementWrapper = styled.div<AchievementWrapperProps>`
    position: absolute;
    width: 100%;
    height: 100%;
    overflow: hidden;
    z-index: 2;
`;

const TeamViewGrid = styled.div<{ $secondaryY: number; $achievementY: number }>`
    width: 100%;
    height: 100%;
    display: grid;
    grid-template-columns: 1fr ${(props) =>
            ((props.$secondaryY * 2) / 9) * 16}px;
    grid-template-rows: 1fr ${(props) => props.$secondaryY}px ${(props) =>
            props.$secondaryY}px ${(props) => props.$achievementY}px;
    z-index: 3;
    border-radius: ${c.GLOBAL_BORDER_RADIUS};
`;

const SecondaryMediaWrapper = styled.div<{ withAchievement: boolean }>`
    grid-column: 2 / 3;
    grid-row-start: ${(props) => (props.withAchievement ? 3 : 2)};
    grid-row-end: ${(props) => (props.withAchievement ? 5 : 4)};
    overflow: hidden;
    z-index: 3;
`;

const TaskStatusWrapper = styled.div<{
    withAchievement: boolean;
    withSecondary: boolean;
}>`
    grid-column: 2 / 3;
    grid-row-start: 1;
    grid-row-end: ${(props) =>
        props.withSecondary ? (props.withAchievement ? 3 : 2) : 4};
    display: grid;
    align-items: end;
    overflow: hidden;
    border-radius: ${c.GLOBAL_BORDER_RADIUS};
`;

const TimelineWrapper = styled.div`
    grid-column: 1 / 2;
    grid-row: 4 / 4;
    display: grid;
    align-items: end;
`;

const AchievementGridWrapper = styled.div`
    grid-column: 1 / 3;
    grid-row: 1 / 5;
    position: relative;
    z-index: 2;
`;

const teamViewVariant = (position: TeamViewPosition | undefined) => {
    if (position === TeamViewPosition.SINGLE || position === undefined) {
        return "single";
    } else if (
        position === TeamViewPosition.PVP_TOP ||
        position === TeamViewPosition.PVP_BOTTOM
    ) {
        return "pvp";
    }
    return "split";
};

const SingleContent = ({
    teamId,
    primary,
    secondary,
    achievement,
    showTaskStatus,
    showTimeLine,
    location,
    media,
    audioEnabled,
}: CommonContentProps) => {
    const achievementY = location.sizeY - (location.sizeX / 16) * 9;
    const secondaryY =
        achievementY > 0
            ? achievementY
            : (location.sizeY * c.TEAMVIEW_FULLSCREEN_SECONDARY_FACTOR) / 2;
    const hasPrimary = (primary?.length ?? 0) > 0;
    const hasSecondary = media.presented.secondary.length > 0;
    const mountSecondary = secondary.length > 0;
    const hasAchievement = media.presented.achievement.length > 0;
    const mountAchievement = achievement.length > 0;
    return (
        <>
            {hasPrimary && (
                <PrimaryMediaWrapper>
                    <RoundedTeamMediaHolder
                        {...media}
                        role="primary"
                        audioEnabled={audioEnabled}
                    />
                </PrimaryMediaWrapper>
            )}
            <TeamViewGrid
                $secondaryY={secondaryY}
                $achievementY={achievementY > 0 ? achievementY : 0}
            >
                {mountAchievement && (
                    <AchievementGridWrapper>
                        <AchievementWrapper showTimeline={showTimeLine}>
                            <TeamViewMedia
                                {...media}
                                role="achievement"
                                audioEnabled={audioEnabled}
                            />
                        </AchievementWrapper>
                    </AchievementGridWrapper>
                )}
                {mountSecondary && (
                    <SecondaryMediaWrapper
                        withAchievement={hasAchievement || showTimeLine}
                    >
                        <RoundedTeamMediaHolder
                            {...media}
                            role="secondary"
                            audioEnabled={audioEnabled}
                        />
                    </SecondaryMediaWrapper>
                )}
                {showTaskStatus && (
                    <TaskStatusWrapper
                        withAchievement={hasAchievement || showTimeLine}
                        withSecondary={hasSecondary}
                    >
                        <ContestantViewCorner teamId={teamId} isSmall={false} />
                    </TaskStatusWrapper>
                )}
                {showTimeLine && (
                    <TimelineWrapper>
                        <div>
                            <TimeLine teamId={teamId} />
                        </div>
                    </TimelineWrapper>
                )}
                {showTimeLine && <TimeLineBackground teamId={teamId} />}
            </TeamViewGrid>
        </>
    );
};

type PVPWrapperProps = { $isTop: boolean };

const PVPGrid = styled.div<
    { $primaryY: number; $secondaryY: number } & PVPWrapperProps
>`
    width: 100%;
    height: 100%;
    display: grid;
    grid-template-columns: ${(props) =>
            (props.$primaryY / c.PVP_ASPECT_RATIO_HEIGHT) *
            c.PVP_ASPECT_RATIO_WIDTH}px ${(props) =>
            (props.$secondaryY / c.PVP_ASPECT_RATIO_HEIGHT) *
            c.PVP_ASPECT_RATIO_WIDTH}px;
    grid-template-rows: ${(props) =>
        props.$isTop
            ? `${props.$secondaryY}px 1fr ${c.PVP_TABLE_ROW_HEIGHT * c.PVP_TABLE_ROW_HEIGHT_MULTIPLIER}px ${c.PVP_TABLE_ROW_HEIGHT * c.PVP_TABLE_ROW_HEIGHT_OFFSET_MULTIPLIER}px`
            : `${c.PVP_TABLE_ROW_HEIGHT * c.PVP_TABLE_ROW_HEIGHT_OFFSET_MULTIPLIER}px ${c.PVP_TABLE_ROW_HEIGHT * c.PVP_TABLE_ROW_HEIGHT_MULTIPLIER}px 1fr ${props.$secondaryY}px`};
    z-index: 1;
    border-radius: ${c.GLOBAL_BORDER_RADIUS};
    overflow: hidden;
`;

const PVPPrimaryMediaWrapper = styled.div<PVPWrapperProps>`
    grid-column: 1 / 2;
    grid-row: ${(props) => (props.$isTop ? "1 / 4" : "2 / 5")};
`;

const PVPSecondaryMediaWrapper = styled.div<PVPWrapperProps>`
    grid-column: 2;
    grid-row: ${(props) => (props.$isTop ? "1 / 2" : "4 / 5")};
`;

const PVPTaskStatusWrapper = styled.div<PVPWrapperProps>`
    position: absolute;
    width: 100%;
    height: ${c.PVP_TABLE_ROW_HEIGHT * 3 + "px"};
    top: ${(props) => (props.$isTop ? "auto" : 0)};
    bottom: ${(props) => (!props.$isTop ? "auto" : 0)};
    z-index: 2;
    overflow: hidden;
    display: grid;
    justify-items: end;
`;

const PVPAchievementWrapper = styled.div<PVPWrapperProps>`
    grid-column: 2;
    grid-row: ${(props) => (props.$isTop ? "2 / 3" : "3 / 4")};
    display: grid;
    position: relative;
    background: ${c.PVP_BACKGROUND};
    overflow: hidden;
`;

const PVPTackStatusBackWrapper = styled.div<PVPWrapperProps>`
    grid-column: 2;
    grid-row: ${(props) => (props.$isTop ? "3 / 4" : "2 / 3")};
    background: ${c.PVP_BACKGROUND};
`;

const PVPAchievementInnerWrapper = styled.div`
    position: absolute;
    width: ${c.PVP_ACHIEVEMENT_WIDTH};
    bottom: ${c.PVP_ACHIEVEMENT_BOTTOM_OFFSET};
    z-index: 4;

    object {
        width: 100%;
        height: 100%;
    }
`;

const PVPContent = ({
    teamId,
    primary,
    secondary,
    achievement,
    showTaskStatus,
    showTimeLine,
    location,
    position,
    media,
    audioEnabled,
}: CommonContentProps) => {
    const isTop = position === TeamViewPosition.PVP_TOP;
    const primaryY = location.sizeY - 0.5 * c.PVP_TABLE_ROW_HEIGHT;
    const secondaryY =
        ((location.sizeX -
            ((location.sizeY - 0.5 * c.PVP_TABLE_ROW_HEIGHT) / 9) * 16) /
            16) *
        9;
    const hasPrimary = (primary?.length ?? 0) > 0;
    const mountSecondary = secondary.length > 0;
    const mountAchievement = achievement.length > 0;
    return (
        <>
            <PVPGrid
                $primaryY={primaryY}
                $secondaryY={secondaryY}
                $isTop={isTop}
            >
                {hasPrimary && (
                    <PVPPrimaryMediaWrapper $isTop={isTop}>
                        <TeamViewMedia
                            {...media}
                            role="primary"
                            audioEnabled={audioEnabled}
                        />
                    </PVPPrimaryMediaWrapper>
                )}
                {mountSecondary && (
                    <PVPSecondaryMediaWrapper $isTop={isTop}>
                        <TeamViewMedia
                            {...media}
                            role="secondary"
                            audioEnabled={audioEnabled}
                        />
                    </PVPSecondaryMediaWrapper>
                )}
                {mountAchievement && (
                    <PVPAchievementWrapper $isTop={isTop}>
                        <PVPAchievementInnerWrapper>
                            <TeamViewMedia
                                {...media}
                                role="achievement"
                                audioEnabled={audioEnabled}
                            />
                        </PVPAchievementInnerWrapper>
                    </PVPAchievementWrapper>
                )}
                {showTimeLine && (
                    <PVPAchievementWrapper $isTop={isTop}>
                        <TimeLine teamId={teamId} isPvp={true} />
                    </PVPAchievementWrapper>
                )}
                <PVPTackStatusBackWrapper $isTop={isTop} />
            </PVPGrid>
            {showTaskStatus && (
                <PVPTaskStatusWrapper $isTop={isTop}>
                    <ContestantViewLine
                        teamId={teamId}
                        isTop={isTop}
                        tasksContainerY={(secondaryY / 9) * 16}
                    />
                </PVPTaskStatusWrapper>
            )}
        </>
    );
};

const SplitScreenGrid = styled.div<{ $secondaryY: number }>`
    width: 100%;
    height: 100%;
    display: grid;
    grid-template-columns: 1fr ${(props) =>
            (props.$secondaryY / c.PVP_ASPECT_RATIO_HEIGHT) *
            c.PVP_ASPECT_RATIO_WIDTH}px;
    grid-template-rows: 1fr ${(props) =>
            props.$secondaryY / c.PVP_SECONDARY_DIVISOR}px ${(props) =>
            props.$secondaryY / c.PVP_SECONDARY_DIVISOR}px;
    z-index: 3;
    border-radius: ${c.GLOBAL_BORDER_RADIUS};
`;

const SplitContent = ({
    teamId,
    primary,
    secondary,
    showTaskStatus,
    location,
    media,
    audioEnabled,
}: CommonContentProps) => {
    const hasPrimary = (primary?.length ?? 0) > 0;
    const hasSecondary = media.presented.secondary.length > 0;
    const mountSecondary = secondary.length > 0;
    return (
        <>
            {hasPrimary && (
                <PrimaryMediaWrapper>
                    <RoundedTeamMediaHolder
                        {...media}
                        role="primary"
                        audioEnabled={audioEnabled}
                    />
                </PrimaryMediaWrapper>
            )}
            <SplitScreenGrid
                $secondaryY={location.sizeY * c.SPLITSCREEN_SECONDARY_FACTOR}
            >
                {mountSecondary && (
                    <SecondaryMediaWrapper withAchievement={false}>
                        <RoundedTeamMediaHolder
                            {...media}
                            role="secondary"
                            audioEnabled={audioEnabled}
                        />
                    </SecondaryMediaWrapper>
                )}
                {showTaskStatus && (
                    <TaskStatusWrapper
                        withAchievement={false}
                        withSecondary={hasSecondary}
                    >
                        <ContestantViewCorner teamId={teamId} isSmall={false} />
                    </TaskStatusWrapper>
                )}
            </SplitScreenGrid>
        </>
    );
};

export const TeamView: OverlayWidgetC<Widget.TeamViewWidget> = ({
    widgetData,
    transitionState,
}) => {
    const settings = widgetData.settings;
    const [curSettings, setCurSettings] = useState(settings);
    const [loadedSettings, setLoadedSettings] =
        useState<OverlayTeamViewSettings | null>(null);
    const sameTeam = settings.teamId === curSettings.teamId;
    if (sameTeam && settings !== curSettings) {
        setCurSettings(settings);
    }
    const nextSettings = sameTeam ? null : settings;
    const onNextLoaded = useCallback(
        () => setLoadedSettings(nextSettings),
        [nextSettings],
    );

    useEffect(() => {
        if (nextSettings === null || loadedSettings !== nextSettings) return;
        const timeout = setTimeout(() => {
            setCurSettings(nextSettings);
            setLoadedSettings(null);
        }, c.TEAM_VIEW_APPEAR_TIME);
        return () => clearTimeout(timeout);
    }, [nextSettings, loadedSettings]);

    return (
        <>
            <TeamViewSingleContent
                key={curSettings?.teamId}
                widgetData={{ ...widgetData, settings: curSettings }}
                transitionState={transitionState}
                audioEnabled={
                    nextSettings === null || loadedSettings !== nextSettings
                }
            />
            {nextSettings && (
                <TeamViewSingleContent
                    key={nextSettings?.teamId}
                    widgetData={{ ...widgetData, settings: nextSettings }}
                    transitionState={transitionState}
                    onLoaded={onNextLoaded}
                    audioEnabled={loadedSettings === nextSettings}
                />
            )}
        </>
    );
};

type TeamViewSingleContentProps = OverlayWidgetProps<Widget.TeamViewWidget> & {
    onLoaded?: () => void;
    audioEnabled?: boolean;
};

export const TeamViewSingleContent: React.FC<TeamViewSingleContentProps> = ({
    widgetData: { settings, widgetLocationId },
    transitionState,
    onLoaded,
    audioEnabled = true,
}) => {
    const media = useTeamViewMedia(settings);
    const { position } = settings;
    const location = c.WIDGET_POSITIONS[widgetLocationId] as LocationRectangle;
    const variant = teamViewVariant(position);

    const isLoaded = media.loaded;

    useLayoutEffect(() => {
        if (isLoaded && onLoaded) {
            onLoaded();
        }
    }, [isLoaded, onLoaded]);

    const props = {
        ...media.settings,
        media,
        audioEnabled: audioEnabled && isLoaded,
        location,
    };
    return (
        <TeamViewContainer
            show={isLoaded}
            animation={
                isLoaded && (transitionState === "exiting" ? slideOut : slideIn)
            }
            animationStyle={
                transitionState === "exiting" ? "ease-in" : "ease-out"
            }
            data-teamid={settings?.teamId}
        >
            {variant === "single" && <SingleContent {...props} />}
            {variant === "pvp" && <PVPContent {...props} />}
            {variant === "split" && <SplitContent {...props} />}
        </TeamViewContainer>
    );
};
TeamView.ignoreAnimation = true;
TeamView.overrideTimeout = c.TEAM_VIEW_APPEAR_TIME;
