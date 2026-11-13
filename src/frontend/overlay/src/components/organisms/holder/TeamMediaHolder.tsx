import styled from "styled-components";
import { MediaType } from "@shared/api";
import { useQueryParams } from "@/utils/query-params";
import React, { useCallback, useEffect, useRef } from "react";
import Hls from "hls.js";
import mpegts from "mpegts.js";
import { GrabberPlayerClient } from "@/utils/grabber/grabber_player";

type MediaHolderProps<M extends MediaType> = {
    media: M;
    onLoadStatus: (currentStatus: boolean) => void;
    className?: string;
    loop?: boolean;
    onEnded?: () => void;
    audioEnabled?: boolean;
};

const mediaFailed = (kind: string, onLoadStatus: (ready: boolean) => void) => {
    onLoadStatus(false);
    console.error(new Error(`Unable to load ${kind} media`));
};

const useMediaPlayback = (
    ref: React.RefObject<HTMLMediaElement | null>,
    audio: boolean,
    onLoadStatus: (ready: boolean) => void,
) => {
    const play = useCallback(() => {
        const video = ref.current;
        if (video && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
            void video.play().catch((error) => {
                if (video.isConnected) {
                    onLoadStatus(false);
                    console.error(error);
                }
            });
        }
    }, [ref, onLoadStatus]);
    // Chromium can pause autoplay when a preloaded video becomes audible.
    // Resume after the mute property commits, retaining the same player.
    useEffect(play, [play, audio]);
    return useCallback(() => {
        onLoadStatus(true);
        play();
    }, [onLoadStatus, play]);
};

const useIsTeamMediaAudio = () => {
    const queryParams = useQueryParams();
    return (
        (!queryParams.has("teamMediaAudio") && window["obsstudio"]) ||
        (queryParams.has("teamMediaAudio") &&
            queryParams.get("teamMediaAudio") !== "false")
    );
};

const MediaWrapper = styled.div<{ $vertical?: boolean }>`
    overflow: hidden;
    text-align: right;

    width: 100%;
    height: ${(props) => (props.$vertical ? "100%" : "auto")};
    max-width: 100%;
    max-height: 100%;
`;

const ImgContainer = styled.img<{ $vertical?: boolean }>`
    width: ${(props) => (props.$vertical ? "auto" : "100%")};
    height: ${(props) => (props.$vertical ? "100%" : "auto")};
    overflow: hidden;
`;

const VideoContainer = styled.video<{ $vertical?: boolean }>`
    width: ${(props) => (props.$vertical ? "auto" : "100%")};
    height: ${(props) => (props.$vertical ? "100%" : "auto")};
    overflow: hidden;
`;

export const ImageMediaHolder = ({
    onLoadStatus,
    className,
    media: { url, vertical },
}: MediaHolderProps<MediaType.Image>) => {
    return (
        <MediaWrapper $vertical={vertical} className={className}>
            <ImgContainer
                src={url}
                onLoad={() => onLoadStatus(true)}
                onError={() => mediaFailed("image", onLoadStatus)}
                $vertical={vertical}
            />
        </MediaWrapper>
    );
};

export const VideoMediaHolder = ({
    onLoadStatus,
    audioEnabled = true,
    loop = true,
    onEnded,
    className,
    media: { url, vertical },
}: MediaHolderProps<MediaType.Video>) => {
    const audio = useIsTeamMediaAudio() && audioEnabled;
    const videoRef = useRef<HTMLVideoElement>(null);
    const onCanPlay = useMediaPlayback(videoRef, audio, onLoadStatus);
    return (
        <MediaWrapper $vertical={vertical} className={className}>
            <VideoContainer
                ref={videoRef}
                src={url}
                onCanPlay={onCanPlay}
                onError={() => mediaFailed("video", onLoadStatus)}
                autoPlay
                loop={loop}
                onEnded={onEnded}
                muted={!audio}
                controls={false}
                $vertical={vertical}
            />
        </MediaWrapper>
    );
};

export const HLSVideoMediaHolder = ({
    onLoadStatus,
    audioEnabled = true,
    loop = true,
    onEnded,
    className,
    media: { url, jwtToken, vertical },
}: MediaHolderProps<MediaType.HLSVideo>) => {
    const audio = useIsTeamMediaAudio() && audioEnabled;

    const playerRef = useRef<HTMLVideoElement>(null);
    const onCanPlay = useMediaPlayback(playerRef, audio, onLoadStatus);
    useEffect(() => {
        let hls: Hls;

        function _initPlayer() {
            if (hls != null) {
                hls.destroy();
            }

            const newHls = new Hls({
                enableWorker: false,
                xhrSetup: (xhr) => {
                    if (jwtToken) {
                        xhr.setRequestHeader(
                            "Authorization",
                            "Bearer " + jwtToken,
                        );
                    }
                },
            });

            if (playerRef.current != null) {
                newHls.attachMedia(playerRef.current);
            }

            newHls.on(Hls.Events.MEDIA_ATTACHED, () => {
                newHls.loadSource(url);

                newHls.on(Hls.Events.MANIFEST_PARSED, () => {
                    // autoplay
                    playerRef?.current
                        ?.play()
                        .catch(() =>
                            console.warn(
                                "Unable to autoplay hls video prior to user interaction with the dom",
                            ),
                        );
                });
            });

            newHls.on(Hls.Events.ERROR, function (event, data) {
                if (data.fatal) {
                    mediaFailed("HLS", onLoadStatus);
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            newHls.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            newHls.recoverMediaError();
                            break;
                        default:
                            _initPlayer();
                            break;
                    }
                }
            });

            hls = newHls;
        }

        // Check for Media Source support
        if (Hls.isSupported()) {
            _initPlayer();
        }

        return () => {
            if (hls != null) {
                hls.destroy();
            }
        };
    }, [url, jwtToken, onLoadStatus]);

    // If Media Source is supported, use HLS.js to play video
    // And fallback to using a regular video player if HLS is supported by default in the user's browser
    const src = Hls.isSupported() ? undefined : url;

    return (
        <MediaWrapper $vertical={vertical} className={className}>
            <VideoContainer
                ref={playerRef}
                src={src}
                onCanPlay={onCanPlay}
                onError={() => mediaFailed("video", onLoadStatus)}
                autoPlay
                loop={loop}
                onEnded={onEnded}
                muted={!audio}
                controls={false}
                $vertical={vertical}
            />
        </MediaWrapper>
    );
};

export const M2tsVideoMediaHolder = ({
    onLoadStatus,
    audioEnabled = true,
    loop = true,
    onEnded,
    className,
    media: { url, vertical },
}: MediaHolderProps<MediaType.M2tsVideo>) => {
    const audio = useIsTeamMediaAudio() && audioEnabled;

    const videoRef = useRef<HTMLVideoElement>(null);
    const onCanPlay = useMediaPlayback(videoRef, audio, onLoadStatus);
    useEffect(() => {
        onLoadStatus(false);
        const videoElement = videoRef.current;
        if (videoElement) {
            const player = mpegts.createPlayer({
                type: "mpegts",
                isLive: loop,
                url: url,
            });
            player.attachMediaElement(videoElement);
            player.load();
            return () => {
                player.destroy();
            };
        }
        return () => {
            if (videoElement) {
                videoElement.srcObject = null;
            }
        };
    }, [url, onLoadStatus, loop]);

    return (
        <MediaWrapper $vertical={vertical} className={className}>
            <VideoContainer
                ref={videoRef}
                onCanPlay={onCanPlay}
                onError={() => mediaFailed("video", onLoadStatus)}
                autoPlay
                loop={loop}
                onEnded={onEnded}
                muted={!audio}
                controls={false}
                $vertical={vertical}
            />
        </MediaWrapper>
    );
};

export const WebRTCGrabberMediaHolder = ({
    onLoadStatus,
    audioEnabled = true,
    className,
    media: { url, peerName, streamType, credential, vertical },
}: MediaHolderProps<MediaType.WebRTCGrabberConnection>) => {
    const audio = useIsTeamMediaAudio() && audioEnabled;

    const videoRef = useRef<HTMLVideoElement>(null);
    const onCanPlay = useMediaPlayback(videoRef, audio, onLoadStatus);
    useEffect(() => {
        const videoElement = videoRef.current;
        const client = new GrabberPlayerClient("play", url);
        client.authorize(credential);
        client.on("initialized", () => {
            console.info(
                `WebRTCGrabber: Connecting to peer ${peerName} for stream ${streamType}`,
            );
            client.connect({ peerName: peerName }, streamType, (track) => {
                if (videoElement) {
                    videoElement.srcObject = null;
                    videoElement.srcObject = track;
                    videoElement.play();
                }
                console.info(
                    `WebRTCGrabber: pc2 received remote stream (${peerName}, ${streamType})`,
                );
            });
        });
        client.on("auth:failed", () => {
            mediaFailed("WebRTC authentication", onLoadStatus);
            console.warn(
                `WebRTCGrabber: Connection failed from ${url} peerName ${peerName}. Incorrect credential`,
            );
        });
        client.on("connection:failed", () => {
            console.warn(
                `WebRTCGrabber: Connection failed from ${url} peerName ${peerName}. No such peer with ${streamType}`,
            );
            mediaFailed("WebRTC grabber", onLoadStatus);
        });

        return () => {
            client.close();
            if (videoElement) {
                videoElement.srcObject = null;
            }
        };
    }, [url, peerName, streamType, credential, onLoadStatus]);

    return (
        <MediaWrapper $vertical={vertical} className={className}>
            <VideoContainer
                ref={videoRef}
                onCanPlay={onCanPlay}
                onError={() => mediaFailed("video", onLoadStatus)}
                muted={!audio}
                controls={false}
                $vertical={vertical}
            />
        </MediaWrapper>
    );
};

export const WebRTCProxyMediaHolder = ({
    onLoadStatus,
    audioEnabled = true,
    className,
    media: { url, audioUrl, vertical },
}: MediaHolderProps<MediaType.WebRTCProxyConnection>) => {
    const audio = useIsTeamMediaAudio() && audioEnabled;

    const videoRef = useRef<HTMLVideoElement>(null);
    const onCanPlay = useMediaPlayback(videoRef, audio, onLoadStatus);
    const audioRef = useRef<HTMLAudioElement>(null);
    const reportAudioFailure = useCallback(
        (ready: boolean) => {
            if (!ready) onLoadStatus(false);
        },
        [onLoadStatus],
    );
    const onAudioCanPlay = useMediaPlayback(
        audioRef,
        audio,
        reportAudioFailure,
    );
    useEffect(() => {
        onLoadStatus(false);
        const connection = new RTCPeerConnection();
        const abort = new AbortController();
        const video = videoRef.current;
        connection.ontrack = (event) => {
            if (event.track.kind === "video" && video) {
                video.srcObject = event.streams[0];
                void video.play().catch((error) => {
                    if (!abort.signal.aborted) {
                        onLoadStatus(false);
                        console.error(error);
                    }
                });
            }
        };
        connection.addTransceiver("video");
        connection.addTransceiver("audio");
        const connect = async () => {
            const offer = await connection.createOffer();
            if (abort.signal.aborted) return;
            await connection.setLocalDescription(offer);
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(offer),
                signal: abort.signal,
            });
            if (!response.ok)
                throw new Error(
                    `WebRTC signaling failed: HTTP ${response.status}`,
                );
            const answer = await response.json();
            if (!abort.signal.aborted)
                await connection.setRemoteDescription(answer);
        };
        void connect().catch((error) => {
            if (!abort.signal.aborted) {
                onLoadStatus(false);
                console.error(error);
            }
        });
        return () => {
            abort.abort();
            connection.close();
            if (video) video.srcObject = null;
        };
    }, [url, onLoadStatus]);

    return (
        <MediaWrapper $vertical={vertical} className={className}>
            <VideoContainer
                ref={videoRef}
                onCanPlay={onCanPlay}
                onError={() => mediaFailed("video", onLoadStatus)}
                muted={!audio}
                controls={false}
                $vertical={vertical}
            />
            {audioUrl && (
                <audio
                    ref={audioRef}
                    src={audioUrl}
                    onCanPlay={onAudioCanPlay}
                    muted={!audio}
                    onError={() => mediaFailed("WebRTC audio", onLoadStatus)}
                    autoPlay
                />
            )}
        </MediaWrapper>
    );
};

export const ObjectMediaHolder = ({
    onLoadStatus,
    media: { url },
}: MediaHolderProps<MediaType.Object>) => {
    const element = useRef<HTMLObjectElement>(null);
    useEffect(() => {
        const object = element.current;
        const failed = () => mediaFailed("SVG object", onLoadStatus);
        object?.addEventListener("error", failed);
        return () => object?.removeEventListener("error", failed);
    }, [onLoadStatus]);
    return (
        <object
            ref={element}
            data={url}
            type="image/svg+xml"
            onLoad={() => onLoadStatus(true)}
        />
    );
};

export const TeamMediaHolder = ({
    media,
    ...props
}: MediaHolderProps<MediaType>) => {
    switch (media.type) {
        case MediaType.Type.Image:
            return (
                <ImageMediaHolder media={media} {...props}></ImageMediaHolder>
            );
        case MediaType.Type.Object:
            return (
                <ObjectMediaHolder media={media} {...props}></ObjectMediaHolder>
            );
        case MediaType.Type.Video:
            return (
                <VideoMediaHolder media={media} {...props}></VideoMediaHolder>
            );
        case MediaType.Type.HLSVideo:
            return (
                <HLSVideoMediaHolder
                    media={media}
                    {...props}
                ></HLSVideoMediaHolder>
            );
        case MediaType.Type.M2tsVideo:
            return (
                <M2tsVideoMediaHolder
                    media={media}
                    {...props}
                ></M2tsVideoMediaHolder>
            );
        case MediaType.Type.WebRTCGrabberConnection:
            return (
                <WebRTCGrabberMediaHolder
                    media={media}
                    {...props}
                ></WebRTCGrabberMediaHolder>
            );
        case MediaType.Type.WebRTCProxyConnection:
            return (
                <WebRTCProxyMediaHolder
                    media={media}
                    {...props}
                ></WebRTCProxyMediaHolder>
            );
        default:
            return null;
    }
};
