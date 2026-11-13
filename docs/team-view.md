# Team View controls

Team View has independent Single, PvP, and SplitScreen layouts. Each position saves its team, main and additional media, task-information visibility, achievements, timeline, and display state. Selecting another layout changes the editing target; it does not hide or show any layout.

## Studio toggle

Each layout remembers its own **Studio** toggle, initially off. The toolbar reserves separate areas for layout selection, Studio, and actions, keeping the toggle anchored when actions or status text change. The Teams and Settings headings stay the same in both modes.

With Studio off, selecting a team immediately switches and shows the target position. Media and information switches save immediately while preserving visibility. Every layout uses the Show/Hide controls on each position card. For a coordinated visibility change across positions, enable Studio, edit their Visible switches, and Apply. The toolbar is reserved for layout selection, Studio, and draft submission.

With Studio on, all edits are local drafts, including each position's **Visible** switch. The current broadcast keeps playing. The first edit captures the entire layout's confirmed settings and visibility. Subsequent edits change that local snapshot. Position cards show the configuration that Apply will publish, including draft visibility and information switches. Edited cards use the primary accent color; unchanged cards use normal text. The same summary area is used throughout editing, applying, and discarding, with fixed text heights and hover titles for truncated names or settings. Studio off shows confirmed settings in that same area.

The layout has one **Apply** button. It submits all positions' settings and visibility together in one request. **Discard changes** removes the layout's draft and restores the latest confirmed server state in the editor. Both buttons are disabled when there is no difference. Editing back to the confirmed values removes the draft. There are no individual-position Apply buttons.

For example, with PvP showing A at Top and B at Bottom:

1. Enable Studio, target Top, and select C.
2. Turn off Bottom's Visible switch.
3. The broadcast still shows A and B. Click Apply to show C at Top and hide Bottom.

Single and SplitScreen remain unchanged. A hidden position stays hidden unless its draft Visible switch is changed. Selecting a team in Studio does not implicitly show it.

Turning Studio off retains unapplied drafts without publishing them. Immediate edits use the confirmed server state. Enable Studio again to continue editing the retained snapshot or discard it. Discard only affects unapplied changes; it does not undo a successful Apply.

## Selection, persistence, and failures

The permanent team list is searchable and includes Automode. Each layout remembers its target position. Single targets its only position; PvP initially targets Top and SplitScreen initially targets Top left. Main media takes priority: selecting the current additional media as main clears additional to **empty** in the same update. The additional picker disables the selected main type; both pickers disable unavailable media and allow **empty**. To swap screen + camera to camera + screen, select camera as main, then screen as additional. With Studio on, these intermediate edits stay local until Apply.

The browser tab's `sessionStorage` stores layout selection, targets, search, Studio toggles, and drafts. These survive navigation and refresh, belong to that tab, and disappear when it closes. Separate origins, including different ports, use separate storage. Confirmed settings and visibility are stored under `config/presets/` and survive backend restarts.

On the first visit, the selected layout is inferred from a visible position, with Single taking priority. If all positions are hidden, Single is selected. Later visits retain the tab's selection.

Apply locks the affected layout's editor, visibility switches, Studio toggle, and Discard until the request finishes. Team rows and available settings retain their normal appearance while locked, with progress shown on the affected position. Other layouts remain usable. Success clears the submitted draft; failure displays an error and retains it for retry. A successful response confirms server state, not completion of video loading or transitions.

## Media loading and transitions

Switching teams preloads the new team and fades the whole position. Returning to the displayed team cancels its pending replacement.

For the same team, changed main, additional, and achievement media preload while the current output continues playing. Changed media within one position wait for each other, then crossfade together using `TEAM_VIEW_APPEAR_TIME`. Only changed regions fade. Unchanged players retain their DOM instances, connections, and playback progress. Swapping main and additional media prepares a replacement for each region.

Adding media fades it in; removing it fades it out. Empty media does not require loading. Layout changes and information switches accompanying a media replacement are presented when its transition starts. Information-only edits apply without restarting media.

Pending replacements are muted. Audio switches from outgoing to incoming players when the fade begins. Initial media stays muted until the position is ready to appear. Once a fade completes, outgoing players are released.

A newer edit replaces a candidate that is still loading. During a fade, the current transition finishes before the latest requested configuration is prepared. Obsolete callbacks cannot publish discarded media. Loading errors are reported in the overlay browser console and retain the current output; a failure during a fade restores the previous media. Later playback errors do not hide unrelated media or team information.

Hiding unmounts the position and releases players and connections. Showing starts streams again. Automode may select a different team when shown again. These rendering rules apply to both Studio Apply and immediate changes.

## API and deployment

`POST /api/admin/<group>/apply` accepts a complete map of positions to `{ settings, shown }`. Groups are `teamView`, `teamPVP`, and `splitScreen`. For example:

```json
{
  "PVP_TOP": {
    "settings": {"teamId": "C", "mediaTypes": ["screen", "camera"]},
    "shown": true
  },
  "PVP_BOTTOM": {
    "settings": {"teamId": "B", "mediaTypes": ["camera", null]},
    "shown": false
  }
}
```

The complete body and exact position-key set are validated before any controller changes. Missing/extra/wrong-group keys and malformed settings or visibility return HTTP 400. Each position changes configuration and visibility in one controller update. Continuously visible positions preserve their stacking order. The request coordinates settings submission; media readiness is coordinated within each position, not across the whole layout.

Existing endpoints retain their behavior. Posting settings to `/api/admin/<group>/<position>` preserves visibility. Per-position and group `/show` and `/hide` change visibility only. `/show_with_settings` saves settings and shows its position or complete group.

The server's persistent format is unchanged. Studio uses a separate tab-local storage key from the former preparation interface. Refresh admin and OBS browser pages after updating the JAR. The [development guide](development.md) includes a local preview with sample videos, synchronized controls and Program output, and regression tests.
