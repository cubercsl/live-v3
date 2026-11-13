import React, { useCallback, useEffect, useReducer, useState } from "react";
import styled from "styled-components";
import {
    MediaType,
    OverlayTeamViewSettings,
    TeamViewPosition,
} from "@shared/api";
import c from "../../../config";
import { TeamMediaHolder } from "./TeamMediaHolder";

export const mediaRoles = ["primary", "secondary", "achievement"] as const;
export type MediaRole = (typeof mediaRoles)[number];
type Source = { id: string; media: MediaType };
type Frame = {
    settings: OverlayTeamViewSettings;
    sources: Record<MediaRole, Source | null>;
};
type State = {
    current: Frame;
    next: Frame | null;
    requested: OverlayTeamViewSettings;
    generation: number;
    fading: boolean;
    ready: Set<string>;
};
type Action =
    | { type: "request"; settings: OverlayTeamViewSettings }
    | { type: "loaded"; id: string; ready: boolean }
    | { type: "start"; generation: number }
    | { type: "finish"; generation: number };

// Connection identity excludes presentation and metadata, so orientation changes
// and fresh contest snapshots retain the existing player and its buffer.
const sourceKey = (media: MediaType | undefined) => {
    if (!media) return "empty";
    switch (media.type) {
        case MediaType.Type.HLSVideo:
            return JSON.stringify([media.type, media.url, media.jwtToken]);
        case MediaType.Type.WebRTCGrabberConnection:
            return JSON.stringify([
                media.type,
                media.url,
                media.peerName,
                media.streamType,
                media.credential,
            ]);
        case MediaType.Type.WebRTCProxyConnection:
            return JSON.stringify([media.type, media.url, media.audioUrl]);
        default:
            return JSON.stringify([media.type, media.url]);
    }
};
const frame = (
    settings: OverlayTeamViewSettings,
    generation: number,
    previous?: Frame,
    candidate?: Frame | null,
): Frame => ({
    settings,
    sources: Object.fromEntries(
        mediaRoles.map((role) => {
            const rendersAchievement =
                settings.position === undefined ||
                [
                    TeamViewPosition.SINGLE,
                    TeamViewPosition.PVP_TOP,
                    TeamViewPosition.PVP_BOTTOM,
                ].includes(settings.position);
            const media =
                role === "achievement" && !rendersAchievement
                    ? undefined
                    : settings[role][0];
            const old = [
                previous?.sources[role],
                candidate?.sources[role],
            ].find(
                (source) =>
                    source && sourceKey(source.media) === sourceKey(media),
            );
            return [
                role,
                media
                    ? {
                          id: old ? old.id : `${generation}:${role}`,
                          media,
                      }
                    : null,
            ];
        }),
    ) as Frame["sources"],
});
const allReady = (value: Frame, ready: Set<string>) =>
    mediaRoles.every(
        (role) =>
            value.sources[role] === null || ready.has(value.sources[role].id),
    );
const prepare = (state: State, settings: OverlayTeamViewSettings): State => {
    const generation = state.generation + 1;
    const next = frame(settings, generation, state.current, state.next);
    const changed = mediaRoles.some(
        (role) => next.sources[role]?.id !== state.current.sources[role]?.id,
    );
    const retainedIds = new Set(
        [
            ...Object.values(state.current.sources),
            ...Object.values(next.sources),
        ]
            .filter((source) => source !== null)
            .map((source) => source.id),
    );
    return {
        ...state,
        requested: settings,
        generation,
        fading: false,
        current: changed ? state.current : next,
        next: changed ? next : null,
        ready: new Set([...state.ready].filter((id) => retainedIds.has(id))),
    };
};
const reducer = (state: State, action: Action): State => {
    switch (action.type) {
        case "request":
            return state.fading
                ? { ...state, requested: action.settings }
                : prepare(state, action.settings);
        case "loaded": {
            if (
                ![state.current, state.next].some(
                    (value) =>
                        value &&
                        Object.values(value.sources).some(
                            (source) => source?.id === action.id,
                        ),
                )
            )
                return state;
            if (state.ready.has(action.id) === action.ready) return state;
            const ready = new Set(state.ready);
            if (action.ready) ready.add(action.id);
            else ready.delete(action.id);
            const failedCandidate =
                !action.ready &&
                state.next !== null &&
                Object.values(state.next.sources).some(
                    (source) => source?.id === action.id,
                );
            return failedCandidate && state.fading
                ? prepare({ ...state, ready, fading: false }, state.requested)
                : { ...state, ready };
        }
        case "start":
            return state.next &&
                state.generation === action.generation &&
                allReady(state.next, state.ready)
                ? { ...state, fading: true }
                : state;
        case "finish":
            if (
                !state.next ||
                !state.fading ||
                state.generation !== action.generation ||
                !allReady(state.next, state.ready)
            )
                return state;
            return prepare(
                { ...state, current: state.next, next: null, fading: false },
                state.requested,
            );
    }
};

export const useTeamViewMedia = (settings: OverlayTeamViewSettings) => {
    const [state, dispatch] = useReducer(
        reducer,
        settings,
        (initial): State => ({
            current: frame(initial, 0),
            next: null,
            requested: initial,
            generation: 0,
            fading: false,
            ready: new Set(),
        }),
    );
    if (settings !== state.requested) dispatch({ type: "request", settings });
    const [presentedOnce, setPresentedOnce] = useState(false);
    const currentReady = allReady(state.current, state.ready);
    if (currentReady && !presentedOnce) setPresentedOnce(true);
    const nextReady = state.next !== null && allReady(state.next, state.ready);
    useEffect(() => {
        if (!nextReady || state.fading) return;
        // Give newly mounted, already-ready layers a painted opacity-zero frame.
        const timer = requestAnimationFrame(() => {
            const timer2 = requestAnimationFrame(() =>
                dispatch({ type: "start", generation: state.generation }),
            );
            secondFrame = timer2;
        });
        let secondFrame: number | undefined;
        return () => {
            cancelAnimationFrame(timer);
            if (secondFrame !== undefined) cancelAnimationFrame(secondFrame);
        };
    }, [nextReady, state.fading, state.generation]);
    useEffect(() => {
        if (!state.fading) return;
        const timer = setTimeout(
            () => dispatch({ type: "finish", generation: state.generation }),
            c.TEAM_VIEW_APPEAR_TIME,
        );
        return () => clearTimeout(timer);
    }, [state.fading, state.generation]);
    const onLoad = useCallback(
        (id: string, ready: boolean) => dispatch({ type: "loaded", id, ready }),
        [],
    );
    const presented = state.fading ? state.next! : state.current;
    // A replacement may be hidden in its region while the containing layout is
    // still using the old settings. Keep both regions mounted through the fade.
    const settingsWithRegions = {
        ...presented.settings,
        ...Object.fromEntries(
            mediaRoles.map((role) => [
                role,
                presented.settings[role].length
                    ? presented.settings[role]
                    : state.current.settings[role].length
                      ? state.current.settings[role]
                      : (state.next?.settings[role] ?? []),
            ]),
        ),
    } as OverlayTeamViewSettings;
    return {
        state,
        onLoad,
        settings: settingsWithRegions,
        presented: presented.settings,
        loaded: presentedOnce || currentReady,
    };
};

const Region = styled.div`
    display: grid;
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
`;
const Layer = styled.div<{ $visible: boolean }>`
    grid-area: 1 / 1;
    min-width: 0;
    min-height: 0;
    opacity: ${(props) => (props.$visible ? 1 : 0)};
    transition: opacity ${c.TEAM_VIEW_APPEAR_TIME}ms ease-in-out;
`;
const Player: React.FC<{
    source: Source;
    visible: boolean;
    audible: boolean;
    onLoad: (id: string, ready: boolean) => void;
}> = ({ source, visible, audible, onLoad }) => {
    const report = useCallback(
        (ready: boolean) => onLoad(source.id, ready),
        [onLoad, source.id],
    );
    return (
        <Layer
            $visible={visible}
            data-media-layer={visible ? "visible" : "waiting"}
        >
            <TeamMediaHolder
                media={source.media}
                onLoadStatus={report}
                audioEnabled={audible}
            />
        </Layer>
    );
};
export const TeamViewMedia = ({
    state,
    onLoad,
    role,
    className,
    audioEnabled = true,
}: {
    state: State;
    onLoad: (id: string, ready: boolean) => void;
    role: MediaRole;
    className?: string;
    audioEnabled?: boolean;
}) => {
    const current = state.current.sources[role];
    const next = state.next?.sources[role];
    const changed = state.next !== null && current?.id !== next?.id;
    return (
        <Region className={className} data-media-region={role}>
            {current && (
                <Player
                    key={current.id}
                    source={changed ? current : (next ?? current)}
                    visible={!changed || !state.fading}
                    audible={audioEnabled && (!changed || !state.fading)}
                    onLoad={onLoad}
                />
            )}
            {changed && next && (
                <Player
                    key={next.id}
                    source={next}
                    visible={state.fading}
                    audible={audioEnabled && state.fading}
                    onLoad={onLoad}
                />
            )}
        </Region>
    );
};
