# Troubleshooting

## Backend startup and data sources

Inspect `icpclive.log` for the original exception. Check configuration paths relative to the process working directory, credential references, and the selected contest ID. For source connection errors, verify that the contest API and event stream can be reached from the backend host.

For a self-signed HTTPS source, `network.allowUnsecureConnections: true` disables certificate-chain trust checking. Hostname checking is separate: `network.checkedServerName` can specify the name actually present in the certificate. Prefer a correctly trusted certificate for normal deployments.

## Updates stop arriving

Check backend logs and the browser console at `/overlay`. Confirm that the event stream and overlay WebSockets remain connected. CLICS sources require a working long-lived event-feed connection; Codeforces sources may encounter upstream rate limits or anti-DDoS protection. Retain the original error and source URL when reporting a problem.

## Team View settings and visibility

Each Single/PvP/SplitScreen layout is independent. With **Studio** off, team selection switches and shows the target immediately; other settings preserve visibility. All layouts have Show/Hide on their position cards. To change visibility across positions together, use Studio and Apply. Selecting the current additional media as main clears additional to **empty** in the same update. The additional picker disables the selected main type. To swap their media, select the desired main type and then the desired additional type. With Studio on, each card shows the proposed configuration; accent-colored summaries indicate unapplied changes. All edits—including Visible switches—stay local until **Apply** submits the entire layout. **Discard changes** restores the latest confirmed state without modifying the server.

Drafts survive navigation, refresh, layout changes, and disabling Studio. Enable Studio to resume or discard them. Separate tabs and origins have separate drafts. Closing a tab clears its drafts. A failed submission preserves the draft and reports an error. Pending submissions lock the affected layout's controls while retaining their appearance; the position indicates saving and other layouts remain usable.

If Apply succeeds but the old media remains visible, inspect the overlay browser console and the replacement stream. Changed media within a position wait for one another before fading. Loading failures retain the previous output. Same-team information-only changes preserve existing players. Hiding releases players; showing reconnects streams and may select a different Automode team.

After updating the JAR, refresh the admin page and OBS browser source. Compare `/api/admin/<group>/` and the matching `config/presets/` files with browser requests when diagnosing state mismatches. Apply confirms server configuration, while actual playback depends on media readiness. See the [Team View guide](team-view.md) for transition and API behavior.

## Video playback

Check that the configured URL returns a playlist or media stream rather than an HTML player page. Browser/OBS clients must reach the media host directly unless a proxy is explicitly configured. Verify CORS headers and the client's support for the stream's codec. A successful playlist request alone does not establish that video frames decode or that audio plays.
