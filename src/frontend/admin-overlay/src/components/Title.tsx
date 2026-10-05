import React, {
    ChangeEvent,
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import Container from "@mui/material/Container";
import { useSnackbar } from "notistack";
import { errorHandlerWithSnackbar } from "shared-code/errors";
import {
    Autocomplete,
    TextField,
    Button,
    TableCell,
    TableRow,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    CircularProgress,
    Card,
    Stack,
    Alert,
} from "@mui/material";
import ShowPresetButton from "./controls/ShowPresetButton.tsx";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import DeleteIcon from "@mui/icons-material/Delete";
import PreviewIcon from "@mui/icons-material/Preview";
import { PresetsTableCell, ValueEditorProps } from "./PresetsTableCell.tsx";
import { activeRowColor } from "../styles.js";
import {
    PresetSettings,
    usePresetTableRowDataState,
} from "./PresetsTableRowUtils.tsx";
import { PresetsManager } from "./PresetsManager.js";
import { usePresetWidgetService } from "../services/presetWidget.js";
import { useTitleWidgetService } from "../services/titleWidget.js";
import { TitleTemplate } from "@admin/services/titleWidget.ts";

interface TitleSettings extends PresetSettings {
    preset: string;
    leftPreset: string;
    rightPreset: string;
    data: Record<string, unknown>;
}

interface TitleData {
    id: string | number;
    shown: boolean;
    settings: TitleSettings;
}

interface TitleTableRowProps {
    data: TitleData;
    onShow: () => void;
    onEdit: (data: TitleData) => unknown;
    onDelete: () => void;
    onPreviewOpen?: (id: TitleData["id"]) => void;
}

interface PreviewSVGDialogProps {
    onClose: () => void;
    id: string | number;
}

interface ParamsLineProps {
    key?: string;
    pKey: string;
    pValue: unknown;
}

function paramsDataToString(value: Record<string, unknown>): string {
    return Object.entries(value)
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n");
}

function splitKeyValue(line: string): [string, string] | [] {
    const splitIndex = line.indexOf(":");
    if (splitIndex === -1) {
        return [];
    }

    const key = line.substring(0, splitIndex).trim();
    const value = line.substring(splitIndex + 1).trim();

    return key ? [key, value] : [];
}

function parseParamsData(input: string): Record<string, string> {
    if (!input.trim()) return {};

    return input
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map(splitKeyValue)
        .filter((result): result is [string, string] => result.length === 2)
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
}

function createPresetUpdater(
    data: TitleData,
    presetValue: string,
    onEdit: (data: TitleData) => unknown,
): () => void {
    return function updatePreset() {
        const updatedData: TitleData = {
            ...data,
            settings: {
                ...data.settings,
                preset: presetValue,
            },
        };
        onEdit(updatedData);
    };
}

const TitlePreviewContext = createContext<
    ((id: TitleData["id"]) => void) | null
>(null);

type PreviewState =
    | { status: "loading" }
    | { status: "ready"; id: TitleData["id"]; url: string }
    | { status: "error"; id: TitleData["id"]; message: string };

function PreviewSVGDialog({
    id,
    onClose,
}: PreviewSVGDialogProps): React.ReactElement {
    const service = useTitleWidgetService<TitleSettings>(
        "/title",
        undefined,
        false,
    );
    const [result, setResult] = useState<PreviewState>({ status: "loading" });
    const preview: PreviewState =
        result.status !== "loading" && result.id !== id
            ? { status: "loading" }
            : result;

    useEffect(() => {
        let active = true;

        const fetchPreview = async () => {
            try {
                const response = await service.getPreview(id);
                if (!active) return;

                setResult({ status: "ready", id, url: response.content });
            } catch (error) {
                if (!active) return;

                setResult({
                    status: "error",
                    id,
                    message:
                        error instanceof Error ? error.message : String(error),
                });
            }
        };

        void fetchPreview();
        return () => {
            active = false;
        };
    }, [id, service]);

    return (
        <Dialog fullWidth maxWidth="md" open onClose={onClose}>
            <DialogTitle>Title preview</DialogTitle>
            <DialogContent>
                <Card sx={{ borderRadius: 0, minHeight: 200 }}>
                    {preview.status === "loading" && (
                        <Stack alignItems="center" sx={{ py: 3 }}>
                            <CircularProgress aria-label="Loading title preview" />
                        </Stack>
                    )}
                    {preview.status === "ready" && (
                        <object
                            type="image/svg+xml"
                            data={preview.url}
                            style={{ width: "100%", display: "block" }}
                            aria-label="SVG Preview"
                        />
                    )}
                    {preview.status === "error" && (
                        <Alert severity="error">
                            Failed to load title preview: {preview.message}
                        </Alert>
                    )}
                </Card>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} autoFocus>
                    OK
                </Button>
            </DialogActions>
        </Dialog>
    );
}

function TemplateEditor({
    value,
    onSubmit,
    onChange,
}: ValueEditorProps<string>): React.ReactElement {
    const [templates, setTeamplates] = useState<TitleTemplate[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const service = useTitleWidgetService<TitleSettings>(
        "/title",
        undefined,
        false,
    );

    useEffect(() => {
        async function fetchTemplate() {
            try {
                const fetchedTemplates = await service.getTemplates();
                setTeamplates(fetchedTemplates);
            } catch (error) {
                console.error(`Failed to load templates: ${error}`);
            } finally {
                setLoading(false);
            }
        }

        fetchTemplate();
    }, []);

    function handleChange(_event: unknown, newValue: string | null) {
        onChange(newValue || "");
    }

    const templateOptions = templates.map((template) =>
        typeof template === "string"
            ? template
            : template.name || template.content || String(template.id),
    );

    return (
        <Box onSubmit={onSubmit} component="form">
            <Autocomplete
                disablePortal
                freeSolo
                sx={{ width: 1 }}
                size="small"
                value={value || ""}
                onChange={handleChange}
                options={templateOptions}
                loading={loading}
                renderInput={(params) => (
                    <TextField
                        {...params}
                        label="SVG preset"
                        InputProps={{
                            ...params.InputProps,
                            endAdornment: (
                                <>
                                    {loading && (
                                        <CircularProgress
                                            color="inherit"
                                            size={20}
                                        />
                                    )}
                                    {params.InputProps.endAdornment}
                                </>
                            ),
                        }}
                    />
                )}
            />
        </Box>
    );
}

function ParamsLine({ pKey, pValue }: ParamsLineProps): React.ReactElement {
    return (
        <Box component="div" sx={{ wordBreak: "break-word" }}>
            <b>{pKey}</b>: {String(pValue)}
        </Box>
    );
}

function ParamsDataEditor({
    onSubmit,
    value,
    onChange,
}: ValueEditorProps<Record<string, unknown>>): React.ReactElement {
    const initialValue = paramsDataToString(value);
    const [inputValue, setInputValue] = useState<string>(initialValue);
    function handleChange(event: ChangeEvent<HTMLInputElement>) {
        const input = event.target.value;
        setInputValue(input);
        onChange(parseParamsData(input));
    }

    return (
        <Box onSubmit={onSubmit} component="form">
            <TextField
                autoFocus
                multiline
                hiddenLabel
                value={inputValue}
                placeholder="key: value"
                type="text"
                size="small"
                sx={{ width: 1 }}
                onChange={handleChange}
                minRows={2}
                maxRows={10}
            />
        </Box>
    );
}

function renderParamsData(data: Record<string, unknown>): React.ReactElement {
    const entries = Object.entries(data);

    if (entries.length === 0) {
        return <Box sx={{ color: "text.secondary" }}>No parameters</Box>;
    }

    return (
        <Box>
            {entries.map(([key, value]) => (
                <ParamsLine key={key} pKey={key} pValue={value} />
            ))}
        </Box>
    );
}

function PresetSelectionCell({
    shown,
    onShow,
    onLeftPresetSelect,
    onRightPresetSelect,
}: {
    shown: boolean;
    onShow: () => void;
    onLeftPresetSelect: () => void;
    onRightPresetSelect: () => void;
}): React.ReactElement {
    return (
        <TableCell component="th" scope="row" align="left">
            <Box display="flex" gap={0.5}>
                <ShowPresetButton onClick={onShow} checked={shown} />
                <IconButton
                    color="primary"
                    onClick={onLeftPresetSelect}
                    aria-label="Apply left preset"
                    size="small"
                >
                    L
                </IconButton>
                <IconButton
                    color="primary"
                    onClick={onRightPresetSelect}
                    aria-label="Apply right preset"
                    size="small"
                >
                    R
                </IconButton>
            </Box>
        </TableCell>
    );
}

function ActionButtonsCell({
    isEditMode,
    onPreviewOpen,
    onEditClick,
    onDeleteClick,
}: {
    isEditMode: boolean;
    onPreviewOpen?: () => void;
    onEditClick: () => void;
    onDeleteClick: () => void;
}): React.ReactElement {
    return (
        <TableCell component="th" scope="row" align="right">
            <Box display="flex" gap={0.5}>
                {!isEditMode && onPreviewOpen && (
                    <IconButton
                        onClick={onPreviewOpen}
                        aria-label="Preview"
                        size="small"
                    >
                        <PreviewIcon />
                    </IconButton>
                )}
                <IconButton
                    color={isEditMode ? "primary" : "inherit"}
                    onClick={onEditClick}
                    aria-label={isEditMode ? "Save changes" : "Edit row"}
                    size="small"
                >
                    {isEditMode ? <SaveIcon /> : <EditIcon />}
                </IconButton>
                <IconButton
                    color="error"
                    onClick={onDeleteClick}
                    aria-label="Delete row"
                    size="small"
                >
                    <DeleteIcon />
                </IconButton>
            </Box>
        </TableCell>
    );
}

export function TitleTableRow({
    data,
    onShow,
    onEdit,
    onDelete,
    onPreviewOpen,
}: TitleTableRowProps): React.ReactElement {
    const { editData, onClickEdit, onSubmitEdit, onChangeField } =
        usePresetTableRowDataState(data, onEdit);

    const openPreviewFromContext = useContext(TitlePreviewContext);
    const openPreview = onPreviewOpen ?? openPreviewFromContext;
    const isEditMode = editData !== undefined;

    const applyLeftPreset = createPresetUpdater(
        data,
        data.settings.leftPreset,
        onEdit,
    );
    const applyRightPreset = createPresetUpdater(
        data,
        data.settings.rightPreset,
        onEdit,
    );

    return (
        <TableRow
            key={data.id}
            sx={{
                backgroundColor: data.shown ? activeRowColor : undefined,
            }}
        >
            <PresetSelectionCell
                shown={data.shown}
                onShow={onShow}
                onLeftPresetSelect={applyLeftPreset}
                onRightPresetSelect={applyRightPreset}
            />

            <PresetsTableCell
                value={data.settings.leftPreset}
                editValue={editData?.settings?.leftPreset}
                onChange={onChangeField("leftPreset")}
                onSubmit={onSubmitEdit}
                ValueEditor={TemplateEditor}
            />

            <PresetsTableCell
                value={data.settings.rightPreset}
                editValue={editData?.settings?.rightPreset}
                onChange={onChangeField("rightPreset")}
                onSubmit={onSubmitEdit}
                ValueEditor={TemplateEditor}
            />

            <PresetsTableCell
                value={data.settings.preset}
                editValue={editData?.settings?.preset}
                onChange={onChangeField("preset")}
                onSubmit={onSubmitEdit}
                ValueEditor={TemplateEditor}
            />

            <PresetsTableCell
                value={data.settings.data}
                editValue={editData?.settings?.data}
                ValueEditor={ParamsDataEditor}
                onChange={onChangeField("data")}
                onSubmit={onSubmitEdit}
                valuePrinter={renderParamsData}
            />

            <ActionButtonsCell
                isEditMode={isEditMode}
                onPreviewOpen={
                    openPreview ? () => openPreview(data.id) : undefined
                }
                onEditClick={onClickEdit}
                onDeleteClick={onDelete}
            />
        </TableRow>
    );
}

export function Title(): React.ReactElement {
    const { enqueueSnackbar } = useSnackbar();
    const errorHandler = useMemo(
        () => errorHandlerWithSnackbar(enqueueSnackbar),
        [enqueueSnackbar],
    );
    const service = usePresetWidgetService<TitleSettings>(
        "/title",
        errorHandler,
    );
    const [previewId, setPreviewId] = useState<TitleData["id"] | null>(null);

    const defaultRowData: TitleSettings = {
        preset: "",
        leftPreset: "",
        rightPreset: "",
        data: {},
    };

    return (
        <Container maxWidth="lg" sx={{ pt: 2 }} className="Title">
            {previewId !== null && (
                <PreviewSVGDialog
                    id={previewId}
                    onClose={() => setPreviewId(null)}
                />
            )}
            <TitlePreviewContext.Provider value={setPreviewId}>
                <PresetsManager<TitleSettings>
                    service={service}
                    tableKeys={["leftPreset", "rightPreset", "preset", "data"]}
                    tableKeysHeaders={[
                        "Left template",
                        "Right template",
                        "Template",
                        "Data",
                    ]}
                    defaultRowData={defaultRowData}
                    RowComponent={TitleTableRow}
                />
            </TitlePreviewContext.Provider>
        </Container>
    );
}

export type {
    TitleData,
    TitleSettings,
    TitleTableRowProps,
    PreviewSVGDialogProps,
    ParamsLineProps,
};

export default Title;
