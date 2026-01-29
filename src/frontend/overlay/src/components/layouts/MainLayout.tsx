import React from "react";
import { useTransition } from "react-transition-state";
import styled, { Keyframes, keyframes } from "styled-components";
import bg from "../../assets/images/bg.png";
import c from "../../config";
import { DEBUG } from "@/consts";
import { useAppSelector } from "@/redux/hooks";
import { useQueryParams } from "@/utils/query-params";
import { StatusLightBulbs } from "../organisms/status/StatusLightBulbs";
import Advertisement from "../organisms/widgets/Advertisement";
import Pictures from "../organisms/widgets/Pictures";
import Svg from "../organisms/widgets/Svg";
import Queue from "../organisms/widgets/queue/Queue";
import Scoreboard from "../organisms/widgets/scoreboard/Scoreboard";
import Ticker from "../organisms/widgets/Ticker";
import Statistics from "../organisms/widgets/Statistics";
import { TeamView } from "../organisms/widgets/TeamView";
import Videos from "../organisms/widgets/Videos";
// import PVP from "../organisms/widgets/PVP";
import FullScreenClock from "../organisms/widgets/FullScreenClock";
import Locator from "../organisms/widgets/Locator";
import { Widget } from "@shared/api";
import { LocationRectangle } from "@/utils/location-rectangle";

const fadeIn = keyframes`
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
`;

const fadeOut = keyframes`
  from {
    opacity: 1;
  }

  to {
    opacity: 0;
  }
`;

type WidgetWrapProps = {
    left: number | string;
    top: number | string;
    width: number | string;
    height: number | string;
    shouldCrop?: boolean;
    zIndex: number;
    animation: Keyframes;
};

const WidgetWrap = styled.div.attrs<WidgetWrapProps>(
    ({ left, top, width, height }) => {
        return {
            style: {
                left: left + "px",
                top: top + "px",
                width: width + "px",
                height: height + "px",
            },
        };
    },
)<WidgetWrapProps>`
    position: absolute;
    z-index: ${({ zIndex }) => zIndex};

    overflow: ${({ shouldCrop = true }) => (shouldCrop ? "hidden" : "")};

    animation: ${(props) => props.animation} ${c.WIDGET_TRANSITION_TIME}ms
        linear;
    animation-fill-mode: forwards;
`;

const MainLayoutWrap = styled.div`
    width: 1920px;
    height: 1080px;
    background: ${DEBUG ? `url(${bg})` : undefined};
`;

const transitionProps = {
    entering: { animation: fadeIn },
    entered: {},
    exiting: { animation: fadeOut },
    exited: {},
};

const WIDGETS = {
    AdvertisementWidget: Advertisement,
    ScoreboardWidget: Scoreboard,
    QueueWidget: Queue,
    PictureWidget: Pictures,
    SvgWidget: Svg,
    VideoWidget: Videos,
    TickerWidget: Ticker,
    StatisticsWidget: Statistics,
    TeamViewWidget: TeamView,
    // TeamPVPWidget: PVP, // Not actually a widget in backend.
    FullScreenClockWidget: FullScreenClock,
    TeamLocatorWidget: Locator,
};

const useWidgets = () => {
    const queryParams = useQueryParams();
    const widgetsFromState = useAppSelector((state) => state.widgets.widgets);

    if (queryParams.has("forceWidgets")) {
        console.info("forceWidgets=", queryParams.get("forceWidgets"));
        return JSON.parse(queryParams.get("forceWidgets")) as Record<
            Widget["widgetId"],
            Widget
        >;
    } else {
        return widgetsFromState;
    }
};

const WidgetWithTransition: React.FC<{
    obj: Widget;
    params: URLSearchParams;
    isRemoving?: boolean;
    onExited?: (widgetId: string) => void;
}> = ({ obj, params, isRemoving = false, onExited }) => {
    const WidgetComponent = WIDGETS[obj.type];
    const location = c.WIDGET_POSITIONS[
        obj.widgetLocationId
    ] as LocationRectangle;

    const [transition, toggle] = useTransition({
        timeout: WidgetComponent.overrideTimeout ?? c.WIDGET_TRANSITION_TIME,
        mountOnEnter: true,
        unmountOnExit: true,
        enter: true,
        exit: true,
    });

    let shouldShow = !isRemoving && WidgetComponent !== undefined;
    if (shouldShow) {
        if (
            obj.type === "TeamLocatorWidget" &&
            obj.settings?.scene !== (params.get("scene") || undefined)
        ) {
            shouldShow = false;
        } else if (params.get("scene") && obj.type !== "TeamLocatorWidget") {
            shouldShow = false;
        } else if (
            params.get("onlyWidgets") &&
            !params.get("onlyWidgets").split(",").includes(obj.widgetId)
        ) {
            shouldShow = false;
        }
    }

    React.useEffect(() => {
        toggle(shouldShow);
    }, [shouldShow, toggle]);

    React.useEffect(() => {
        if (isRemoving && !transition.isMounted) {
            onExited?.(obj.widgetId);
        }
    }, [isRemoving, transition.isMounted, obj.widgetId, onExited]);

    if (!transition.isMounted) {
        return null;
    }

    return (
        <WidgetWrap
            left={location.positionX}
            top={location.positionY}
            width={location.sizeX}
            height={location.sizeY}
            shouldCrop={WidgetComponent.shouldCrop}
            zIndex={WidgetComponent.zIndex ?? 0}
            {...(!WidgetComponent.ignoreAnimation &&
                transitionProps[transition.status])}
        >
            <WidgetComponent
                widgetData={obj}
                transitionState={transition.status}
            />
        </WidgetWrap>
    );
};

export const MainLayout = () => {
    const widgets = useWidgets();
    const params = useQueryParams();

    const [prevWidgets, setPrevWidgets] = React.useState(widgets);
    const [displayedWidgets, setDisplayedWidgets] = React.useState(widgets);

    if (prevWidgets !== widgets) {
        setPrevWidgets(widgets);

        const currentIds = new Set(Object.keys(widgets));
        const merged: Record<string, Widget> = { ...widgets };

        for (const [id, widget] of Object.entries(displayedWidgets) as [
            string,
            Widget,
        ][]) {
            if (!currentIds.has(id)) {
                merged[id] = widget;
            }
        }

        setDisplayedWidgets(merged);
    }

    const handleExited = (widgetId: string) => {
        setDisplayedWidgets((prev) => {
            const { [widgetId]: _, ...rest } = prev; // eslint-disable-line @typescript-eslint/no-unused-vars
            return rest;
        });
    };

    const currentIds = new Set(Object.keys(widgets));

    return (
        <MainLayoutWrap>
            <StatusLightBulbs compact={true} />
            {(Object.values(displayedWidgets) as Widget[]).map((widget) => (
                <WidgetWithTransition
                    key={widget.widgetId}
                    obj={widget}
                    params={params}
                    isRemoving={!currentIds.has(widget.widgetId)}
                    onExited={handleExited}
                />
            ))}
        </MainLayoutWrap>
    );
};

export default MainLayout;
