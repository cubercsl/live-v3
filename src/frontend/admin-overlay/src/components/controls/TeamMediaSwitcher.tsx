import { TeamMediaType } from "@shared/api";
import { alpha, Button } from "@mui/material";
import ButtonGroup from "@admin/components/atoms/ButtonGroup";

export const DEFAULT_MEDIA_TYPES = [
    TeamMediaType.screen,
    TeamMediaType.camera,
    TeamMediaType.record,
    TeamMediaType.photo,
    null,
];

const mediaTypeName = (type: TeamMediaType | null) => {
    return type === null ? "empty" : type;
};

type TeamMediaSwitcherProps = {
    mediaTypes?: (TeamMediaType | null)[];
    disabled?: boolean;
    pending?: boolean;
    disabledMediaTypes?: TeamMediaType[];
    switchedMediaType?: TeamMediaType | null;
    onSwitch: (type: TeamMediaType | null) => void;
    onSwitchHide?: () => void;
    disabledHide?: boolean;
};

const TeamMediaSwitcher = ({
    mediaTypes = DEFAULT_MEDIA_TYPES,
    disabled,
    pending = false,
    disabledMediaTypes,
    switchedMediaType,
    onSwitch,
    onSwitchHide,
    disabledHide,
}: TeamMediaSwitcherProps) => {
    return (
        <ButtonGroup>
            {mediaTypes.map((type) => {
                const selected = type === switchedMediaType;
                const unavailable =
                    disabled || disabledMediaTypes?.includes(type);
                return (
                    <Button
                        key={type ?? "empty"}
                        disabled={unavailable || pending}
                        disableRipple
                        sx={{
                            mx: 2,
                            "&.Mui-focusVisible": {
                                outline: "2px solid",
                                outlineColor: "primary.main",
                                outlineOffset: 2,
                            },
                            ...(pending && !unavailable
                                ? {
                                      "&.Mui-disabled": {
                                          color: selected
                                              ? "primary.contrastText"
                                              : "primary.main",
                                          backgroundColor: selected
                                              ? "primary.main"
                                              : "transparent",
                                          borderColor: (theme) =>
                                              selected
                                                  ? theme.palette.primary.main
                                                  : alpha(
                                                        theme.palette.primary
                                                            .main,
                                                        0.5,
                                                    ),
                                      },
                                  }
                                : {}),
                        }}
                        variant={selected ? "contained" : "outlined"}
                        onClick={() => onSwitch(type)}
                    >
                        {mediaTypeName(type)}
                    </Button>
                );
            })}
            {onSwitchHide && (
                <Button
                    disabled={disabledHide}
                    variant={!disabledHide ? "outlined" : "contained"}
                    color="error"
                    onClick={() => onSwitchHide()}
                >
                    hide
                </Button>
            )}
        </ButtonGroup>
    );
};

export default TeamMediaSwitcher;
