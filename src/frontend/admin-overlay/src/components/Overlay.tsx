import { Paper } from "@mui/material";
import type { ComponentProps, ReactElement } from "react";
import { OVERLAY_LOCATION } from "../config";
import { Rnd } from "react-rnd";
import { useLocalStorageState } from "../utils";

const FULL_WIDTH = 1920;
const FULL_HEIGHT = 1080;

type OverlayState = {
    scaleFactor: number;
    offsetX: number;
    offsetY: number;
};

type OverlayProps = {
    isOverlayPreviewShown: boolean;
};

type RndProps = ComponentProps<typeof Rnd>;

export function Overlay({ isOverlayPreviewShown }: OverlayProps): ReactElement {
    const [state, setState] = useLocalStorageState<OverlayState>(
        "OverlayPreviewPosition",
        {
            scaleFactor: 0.3,
            offsetX: 0,
            offsetY: 0,
        },
    );

    const onResize: NonNullable<RndProps["onResize"]> = (
        _event,
        _direction,
        element,
        _delta,
        position,
    ) =>
        setState({
            scaleFactor: element.offsetWidth / FULL_WIDTH,
            offsetX: position.x,
            offsetY: position.y,
        });

    const onDrag: NonNullable<RndProps["onDrag"]> = (_event, data) =>
        setState({
            ...state,
            offsetX: data.x,
            offsetY: data.y,
        });

    if (!isOverlayPreviewShown) return null;

    const scaledWidth = FULL_WIDTH * state.scaleFactor;
    const scaledHeight = FULL_HEIGHT * state.scaleFactor;

    return (
        <Rnd
            position={{ x: state.offsetX, y: state.offsetY }}
            size={{ width: scaledWidth, height: scaledHeight }}
            onResize={onResize}
            onResizeStop={onResize}
            onDrag={onDrag}
            onDragStop={onDrag}
            lockAspectRatio
            bounds="body"
        >
            <Paper
                sx={{
                    overflow: "hidden",
                    width: scaledWidth,
                    height: scaledHeight,
                }}
            >
                <iframe
                    src={OVERLAY_LOCATION}
                    width={FULL_WIDTH}
                    height={FULL_HEIGHT}
                    style={{
                        transform: `scale(${state.scaleFactor})`,
                        transformOrigin: "top left",
                        pointerEvents: "none",
                        border: "none",
                    }}
                />
            </Paper>
        </Rnd>
    );
}
