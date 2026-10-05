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
    const widgetsFromState = useAppSelector(
        (state) => state.widgets.widgetsWithOrder,
    );
    const forceWidgets = queryParams.get("forceWidgets");

    const forcedWidgets = React.useMemo(() => {
        if (forceWidgets === null) {
            return null;
        }
        const forced = JSON.parse(forceWidgets) as
            | Widget[]
            | Record<string, Widget>;
        return Object.values(forced);
    }, [forceWidgets]);

    return React.useMemo(() => {
        if (forcedWidgets !== null) {
            return forcedWidgets;
        }
        return widgetsFromState
            .toSorted((a, b) => a.showOrder - b.showOrder)
            .map(({ widget }) => widget);
    }, [forcedWidgets, widgetsFromState]);
};

const WidgetWithTransition: React.FC<{
    obj: Widget;
    params: URLSearchParams;
    isRemoving: boolean;
    onExited: (widgetId: string) => void;
}> = ({ obj, params, isRemoving, onExited }) => {
    const WidgetComponent = WIDGETS[obj.type];
    const location = c.WIDGET_POSITIONS[
        obj.widgetLocationId
    ] as LocationRectangle;

    const [transition, toggle] = useTransition({
        timeout: WidgetComponent?.overrideTimeout ?? c.WIDGET_TRANSITION_TIME,
        mountOnEnter: true,
        unmountOnExit: true,
        enter: true,
        exit: true,
    });

    const shouldShow = React.useMemo(() => {
        if (isRemoving || WidgetComponent === undefined) {
            return false;
        }
        if (
            obj.type === "TeamLocatorWidget" &&
            obj.settings?.scene !== (params.get("scene") || undefined)
        ) {
            return false;
        }
        if (params.get("scene") && obj.type !== "TeamLocatorWidget") {
            return false;
        }
        if (
            params.get("onlyWidgets") &&
            !params.get("onlyWidgets").split(",").includes(obj.widgetId)
        ) {
            return false;
        }
        return true;
    }, [WidgetComponent, obj, params, isRemoving]);

    React.useEffect(() => {
        toggle(shouldShow);
    }, [shouldShow, toggle]);

    React.useEffect(() => {
        if (isRemoving && !transition.isMounted) {
            onExited(obj.widgetId);
        }
    }, [isRemoving, transition.isMounted, obj.widgetId, onExited]);

    if (WidgetComponent === undefined || !transition.isMounted) {
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
    const [retained, setRetained] = React.useState({
        current: widgets,
        displayed: widgets,
    });
    const currentIds = new Set(widgets.map(({ widgetId }) => widgetId));

    if (retained.current !== widgets) {
        const displayed = [...widgets];
        retained.displayed.forEach((widget, index) => {
            if (!currentIds.has(widget.widgetId)) {
                displayed.splice(Math.min(index, displayed.length), 0, widget);
            }
        });
        setRetained({ current: widgets, displayed });
    }

    const handleExited = React.useCallback((widgetId: string) => {
        setRetained((previous) => {
            if (
                previous.current.some((widget) => widget.widgetId === widgetId)
            ) {
                return previous;
            }
            return {
                ...previous,
                displayed: previous.displayed.filter(
                    (widget) => widget.widgetId !== widgetId,
                ),
            };
        });
    }, []);

    return (
        <MainLayoutWrap>
            <StatusLightBulbs compact={true} />
            {retained.displayed.map((obj) => (
                <WidgetWithTransition
                    key={obj.widgetId}
                    obj={obj}
                    params={params}
                    isRemoving={!currentIds.has(obj.widgetId)}
                    onExited={handleExited}
                />
            ))}
        </MainLayoutWrap>
    );
};

export default MainLayout;
