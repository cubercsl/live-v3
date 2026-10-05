import { useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import c from "@/config";
import { isShouldUseDarkColor } from "@/utils/colors";

interface KeylogSvgProps {
    $z: number;
}

const KeylogSvg = styled.svg<KeylogSvgProps>`
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: ${({ $z }) => $z};
`;

type PrometheusKeylogGraphProps = {
    keylog: number[];
    isPvp: boolean;
    teamColor?: string;
};

type Point = [number, number];

function smoothPath(points: Array<Point>) {
    const tension = 0.5;
    let path = `M ${points[0][0]} ${points[0][1]}`;

    for (let i = 0; i < points.length - 1; i++) {
        const [p0x, p0y] = points[Math.max(i - 1, 0)];
        const [p1x, p1y] = points[i];
        const [p2x, p2y] = points[i + 1];
        const [p3x, p3y] = points[Math.min(i + 2, points.length - 1)];

        const cp1x = p1x + ((p2x - p0x) / 6) * tension;
        const cp1y = p1y + ((p2y - p0y) / 6) * tension;
        const cp2x = p2x - ((p3x - p1x) / 6) * tension;
        const cp2y = p2y - ((p3y - p1y) / 6) * tension;

        path += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2x} ${p2y}`;
    }

    return path;
}

export function PrometheusKeylogGraph({
    keylog,
    isPvp,
    teamColor,
}: PrometheusKeylogGraphProps) {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

    useEffect(() => {
        if (!svgRef.current) return;
        const ro = new ResizeObserver(([entry]) => {
            const cr = entry.contentRect;
            setSize({ w: cr.width, h: cr.height });
        });

        ro.observe(svgRef.current);
        return () => ro.disconnect();
    }, []);

    const { pathDs, fillDs, isolatedPoints } = useMemo(() => {
        const w = size.w;
        const h = size.h;

        if (!w || !h || !keylog.length)
            return { pathDs: [], fillDs: [], isolatedPoints: [] as Point[] };

        const leftPad = c.TIMELINE_LEFT_TIME_PADDING;
        const usableW =
            w * (isPvp ? c.TIMELINE_REAL_WIDTH_PVP : c.TIMELINE_REAL_WIDTH);
        const rightEdge = leftPad + usableW;

        const maxVal = c.KEYLOG_MAXIMUM_FOR_NORMALIZATION;
        const topPad = c.KEYLOG_TOP_PADDING;
        const bottomPad = c.KEYLOG_BOTTOM_PADDING;

        const segments: Array<Array<Point>> = [];
        let currentSegment: Array<Point> = [];

        for (let i = 0; i < keylog.length; i++) {
            const value = keylog[i];
            if (value < 0) {
                if (currentSegment.length) {
                    segments.push(currentSegment);
                    currentSegment = [];
                }
                continue;
            }

            const t = i / keylog.length;
            const x = leftPad + t * usableW;
            const yNorm = value / maxVal;
            const y = topPad + (1 - yNorm) * (h - topPad - bottomPad);
            currentSegment.push([x, y]);
        }

        if (currentSegment.length) {
            segments.push(currentSegment);
        }

        if (!segments.length)
            return { pathDs: [], fillDs: [], isolatedPoints: [] as Point[] };

        if (!keylog.some((value) => value < 0)) {
            const segment = segments[segments.length - 1];
            segment.push([rightEdge, segment[segment.length - 1][1]]);
        }

        const isolatedPoints = segments
            .filter((segment) => segment.length === 1)
            .map((segment) => segment[0]);
        const paths = segments
            .filter((segment) => segment.length > 1)
            .map((segment) => {
                const line = smoothPath(segment);
                const firstPoint = segment[0];
                const lastPoint = segment[segment.length - 1];
                const fill = `${line} L ${lastPoint[0]} ${h - bottomPad} L ${firstPoint[0]} ${h - bottomPad} Z`;
                return { line, fill };
            });
        return {
            pathDs: paths.map(({ line }) => line),
            fillDs: paths.map(({ fill }) => fill),
            isolatedPoints,
        };
    }, [size, keylog, isPvp]);

    useEffect(() => {
        if (!svgRef.current) return;
        const paths = svgRef.current.querySelectorAll(
            "path[data-line]",
        ) as NodeListOf<SVGPathElement>;
        paths.forEach((path) => {
            const L = path.getTotalLength();
            path.style.transition = "none";
            path.style.strokeDasharray = `${L}`;
            path.style.strokeDashoffset = `${L}`;
            path.getBoundingClientRect();
            path.style.transition = `stroke-dashoffset ${c.KEYLOG_ANIMATION_DURATION}ms ${c.KEYLOG_ANIMATION_EASING}`;
            path.style.strokeDashoffset = "0";
        });
        svgRef.current
            .querySelectorAll<SVGCircleElement>("circle[data-keylog-point]")
            .forEach((point) => {
                point.style.transition = "none";
                point.style.opacity = "0";
                point.getBoundingClientRect();
                point.style.transition = `opacity ${c.KEYLOG_ANIMATION_DURATION}ms ${c.KEYLOG_ANIMATION_EASING}`;
                point.style.opacity = "1";
            });
    }, [pathDs, isolatedPoints]);

    const useDark = isShouldUseDarkColor(teamColor ?? c.CONTEST_COLOR);
    const stroke = useDark ? c.KEYLOG_STROKE_DARK : c.KEYLOG_STROKE_LIGHT;
    const fill = useDark ? c.KEYLOG_FILL_DARK : c.KEYLOG_FILL_LIGHT;

    return (
        <KeylogSvg
            ref={svgRef}
            $z={c.KEYLOG_Z_INDEX}
            preserveAspectRatio="none"
        >
            <defs>
                <filter id="kglow" x="-10%" y="-10%" width="120%" height="120%">
                    <feGaussianBlur
                        stdDeviation={c.KEYLOG_GLOW_BLUR}
                        result="blur"
                    />
                </filter>
            </defs>
            {fillDs.map((fillD, idx) => (
                <path key={`keylog-fill-${idx}`} d={fillD} fill={fill} />
            ))}
            {pathDs.map((pathD, idx) => (
                <path
                    key={`keylog-segment-${idx}`}
                    data-line
                    d={pathD}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={c.KEYLOG_STROKE_WIDTH}
                    strokeLinejoin="miter"
                    strokeLinecap="butt"
                    vectorEffect="non-scaling-stroke"
                />
            ))}
            {isolatedPoints.map(([x, y], idx) => (
                <circle
                    key={`keylog-point-${idx}`}
                    data-keylog-point
                    cx={x}
                    cy={y}
                    r={c.KEYLOG_STROKE_WIDTH / 2}
                    fill={stroke}
                />
            ))}
        </KeylogSvg>
    );
}
