import React, { useEffect, useState } from "react";
import { isEqual } from "lodash";
import { useAppDispatch, useAppSelector } from "../../../../redux/hooks";
import { finishFeaturedPlayback } from "../../../../redux/contest/queue";
import { useTransition } from "react-transition-state";
import styled, { css, CSSObject } from "styled-components";
import c from "@/config";
import { TeamMediaHolder } from "@/components/organisms/holder/TeamMediaHolder";
import { QueueRow } from "./QueueRow";
import { QueueRowInfo } from "./utils/queueState";
import { slideInFromRight, slideOutToRight } from "./utils/animations";

const appearStatesFeatured = {
    entering: css`
        animation: ${slideInFromRight()}
            ${c.QUEUE_ROW_FEATURED_RUN_APPEAR_TIME}ms ease-out;
    `,
    exiting: css`
        animation: ${slideOutToRight()}
            ${c.QUEUE_ROW_FEATURED_RUN_APPEAR_TIME}ms ease-in;
    `,
    exited: css`
        opacity: 0;
    `,
};

const StyledFeatured = styled.div<{ additional: CSSObject }>`
    width: ${c.QUEUE_FEATURED_RUN_WIDTH};
    position: absolute;

    right: calc(100% - ${c.QUEUE_FEATURED_RUN_RIGHT_OFFSET});
    padding: ${c.QUEUE_FEATURED_RUN_PADDING_TOP}
        ${c.QUEUE_FEATURED_RUN_PADDING_RIGHT}
        ${c.QUEUE_FEATURED_RUN_PADDING_BOTTOM}
        ${c.QUEUE_FEATURED_RUN_PADDING_LEFT};

    background-color: ${c.QUEUE_BACKGROUND_COLOR};
    border-radius: ${c.QUEUE_FEATURED_RUN_BORDER_RADIUS_TOP_LEFT} 0 0
        ${c.QUEUE_FEATURED_RUN_BORDER_RADIUS_BOTTOM_LEFT};
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: ${c.QUEUE_ROW_FEATURED_RUN_PADDING}px;

    ${({ additional }) => additional}
    animation-fill-mode: both;
`;

const StyledHorizontalFeatured = styled.div<{ additional: CSSObject }>`
    width: ${c.QUEUE_HORIZONTAL_FEATURED_RUN_WIDTH};
    position: absolute;

    right: 0;
    bottom: 100%;
    padding: ${c.QUEUE_WRAP_PADDING}px;

    background-color: ${c.QUEUE_BACKGROUND_COLOR};
    border-radius: ${c.QUEUE_HORIZONTAL_FEATURED_RUN_BORDER_RADIUS_TOP_LEFT}
        ${c.QUEUE_HORIZONTAL_FEATURED_RUN_BORDER_RADIUS_TOP_RIGHT} 0 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: ${c.QUEUE_ROW_FEATURED_RUN_PADDING}px;

    ${({ additional }) => additional}
    animation-fill-mode: both;
`;

type FeaturedCardProps = {
    runInfo: QueueRowInfo;
    playbackId: number;
    visible: boolean;
    horizontal: boolean;
    onVisibilityChange: (mounted: boolean) => void;
};

const FeaturedCard = ({
    runInfo,
    playbackId,
    visible,
    horizontal,
    onVisibilityChange,
}: FeaturedCardProps) => {
    const dispatch = useAppDispatch();
    const [loaded, setLoaded] = useState(false);
    const [transition, toggle] = useTransition({
        timeout: c.QUEUE_ROW_FEATURED_RUN_APPEAR_TIME,
        mountOnEnter: true,
        unmountOnExit: true,
    });
    const media = runInfo.featuredRunMedia[0];
    const isReaction = runInfo.reactionVideos.some((reaction) =>
        isEqual(reaction, media),
    );

    useEffect(() => {
        toggle(visible && loaded);
    }, [visible, loaded, toggle]);

    useEffect(() => {
        onVisibilityChange(transition.isMounted);
        return () => onVisibilityChange(false);
    }, [transition.isMounted, onVisibilityChange]);

    // Keep the last frame and row mounted until the exit transition finishes.
    if (!visible && !transition.isMounted) return null;

    const Container = horizontal ? StyledHorizontalFeatured : StyledFeatured;
    const appearance =
        loaded && transition.isMounted
            ? appearStatesFeatured[transition.status]
            : appearStatesFeatured.exited;

    return (
        <Container additional={appearance}>
            <TeamMediaHolder
                media={media}
                onLoadStatus={setLoaded}
                loop={!isReaction}
                onEnded={
                    isReaction
                        ? () => dispatch(finishFeaturedPlayback(playbackId))
                        : undefined
                }
            />
            <QueueRow runInfo={runInfo} />
        </Container>
    );
};

export const Featured = ({
    runInfo,
    horizontal,
    onVisibilityChange,
}: {
    runInfo: QueueRowInfo | null;
    horizontal: boolean;
    onVisibilityChange: (mounted: boolean) => void;
}) => {
    const { featuredPlaybackId, isFeaturedPlaybackEnded } = useAppSelector(
        (state) => state.queue,
    );
    const [displayed, setDisplayed] = useState({
        runInfo,
        playbackId: featuredPlaybackId,
    });
    if (
        runInfo &&
        (runInfo !== displayed.runInfo ||
            featuredPlaybackId !== displayed.playbackId)
    ) {
        setDisplayed({ runInfo, playbackId: featuredPlaybackId });
    }

    if (!displayed.runInfo) return null;

    return (
        <React.Fragment key={displayed.playbackId}>
            <FeaturedCard
                runInfo={displayed.runInfo}
                playbackId={displayed.playbackId}
                visible={!!runInfo && !isFeaturedPlaybackEnded}
                horizontal={horizontal}
                onVisibilityChange={onVisibilityChange}
            />
        </React.Fragment>
    );
};
