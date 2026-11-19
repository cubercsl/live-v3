import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { isEqual } from "lodash";
import { QueueRunInfo } from "../../../../generated/api";

interface QueueState {
    queue: QueueRunInfo[];
    totalQueueItems: number;
    featuredPlaybackId: number;
    isFeaturedPlaybackEnded: boolean;
}

const initialState: QueueState = {
    queue: [],
    totalQueueItems: 0,
    featuredPlaybackId: 0,
    isFeaturedPlaybackEnded: false,
};

const updateQueue = (state: QueueState, queue: QueueRunInfo[]) => {
    const previous = state.queue.find((run) => run.featuredRunMedia?.length);
    const current = queue.find((run) => run.featuredRunMedia?.length);
    // Track every queue event so a deselect/reselect survives React batching.
    if (
        previous?.id !== current?.id ||
        !isEqual(previous?.featuredRunMedia, current?.featuredRunMedia)
    ) {
        state.featuredPlaybackId++;
        state.isFeaturedPlaybackEnded = false;
    }
    state.queue = queue;
};

const queueSlice = createSlice({
    name: "queue",
    initialState,
    reducers: {
        addRun: (state, { payload }: PayloadAction<QueueRunInfo>) => {
            updateQueue(state, [
                payload,
                ...state.queue.filter((run) => run.id !== payload.id),
            ]);
            state.totalQueueItems++;
        },
        modifyRun: (state, { payload }: PayloadAction<QueueRunInfo>) => {
            updateQueue(
                state,
                state.queue.map((run) =>
                    run.id === payload.id ? payload : run,
                ),
            );
        },
        removeRun: (state, { payload }: PayloadAction<string>) => {
            updateQueue(
                state,
                state.queue.filter((run) => run.id !== payload),
            );
        },
        setFromSnapshot: (
            state,
            { payload }: PayloadAction<QueueRunInfo[]>,
        ) => {
            updateQueue(state, payload.toReversed());
        },
        finishFeaturedPlayback: (state, { payload }: PayloadAction<number>) => {
            if (state.featuredPlaybackId === payload) {
                state.isFeaturedPlaybackEnded = true;
            }
        },
    },
});

export const {
    addRun,
    modifyRun,
    removeRun,
    setFromSnapshot,
    finishFeaturedPlayback,
} = queueSlice.actions;
export const queueReducer = queueSlice.reducer;
