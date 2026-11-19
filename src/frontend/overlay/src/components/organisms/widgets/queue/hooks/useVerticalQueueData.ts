import { useAppSelector } from "@/redux/hooks";
import c from "@/config";
import { isFTS } from "@/utils/statusInfo";
import { QueueRowInfo } from "../utils/queueState";

export function useVerticalQueueRowsData({
    width: _width,
    height,
    basicZIndex = c.QUEUE_BASIC_ZINDEX,
}: {
    width: number;
    height: number;
    basicZIndex?: number;
}): [QueueRowInfo | null, QueueRowInfo[]] {
    function bottomPosition(index: number) {
        return (c.QUEUE_ROW_HEIGHT + c.QUEUE_ROW_Y_PADDING) * index;
    }

    const allowedMaxRows = Math.min(
        Math.floor(
            (_width / c.QUEUE_ROW_WIDTH) *
                ((height - c.QUEUE_FTS_BOTTOM_OFFSET) /
                    (c.QUEUE_ROW_HEIGHT + c.QUEUE_ROW_Y_PADDING)),
        ),
        c.QUEUE_MAX_ROWS,
    );

    const { queue, totalQueueItems } = useAppSelector((state) => state.queue);

    let rows: QueueRowInfo[] = [];
    let featured: QueueRowInfo | null = null;
    let totalFts = 0;

    queue.forEach((run, runIndex) => {
        const row: QueueRowInfo = {
            ...run,
            zIndex: basicZIndex - runIndex + totalQueueItems,
            bottom: 0,
            right: 0,
            isFeatured: false,
            isFts: isFTS(run),
        };

        if (row.isFts) {
            totalFts++;
            row.bottom = height;
        }

        if ((run.featuredRunMedia?.length ?? 0) > 0) {
            row.isFeatured = true;
            featured = row;
        } else {
            rows.push(row);
        }
    });

    let ftsRowCount = 0;
    let regularRowCount = 0;

    rows.forEach((row) => {
        if (row.isFts) {
            row.bottom = height - bottomPosition(totalFts - ftsRowCount);
            ftsRowCount++;
        } else {
            row.bottom = bottomPosition(regularRowCount);
            regularRowCount++;
        }
    });

    const allowedRegular = allowedMaxRows - ftsRowCount;
    rows = rows.filter((row, index) => {
        return row.isFts || index < allowedRegular;
    });

    return [featured, rows];
}
