import { useMemo, useCallback } from "react";
import { useAppSelector } from "@/redux/hooks";
import { isFTS } from "@/utils/statusInfo";
import { QueueRowInfo } from "../utils/queueState";
import { QueueRunInfo } from "@shared/api";

export function useQueueItemProcessing(basicZIndex: number) {
    const { queue, totalQueueItems } = useAppSelector((state) => state.queue);

    const createBaseRow = useCallback(
        (run: QueueRunInfo, index: number): QueueRowInfo => ({
            ...run,
            zIndex: basicZIndex - index + totalQueueItems,
            bottom: 0,
            right: 0,
            isFeatured: false,
            isFts: isFTS(run),
        }),
        [basicZIndex, totalQueueItems],
    );

    return useMemo(() => {
        let featured: QueueRowInfo | null = null;
        const processingQueue: QueueRowInfo[] = [];

        queue.forEach((run, index) => {
            const row = createBaseRow(run, index);

            if ((run.featuredRunMedia?.length ?? 0) > 0) {
                row.isFeatured = true;
                featured = row;
            } else {
                processingQueue.push(row);
            }
        });

        return {
            originalQueue: queue,
            processingQueue,
            featured,
        };
    }, [queue, createBaseRow]);
}
