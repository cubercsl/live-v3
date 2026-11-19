# Overlay controls

## Featured runs and reaction videos

In Analytics, select a submission and choose a Featured run media source. The queue displays the first media item for that source. Selecting another Featured run replaces the current selection; selecting the same reaction again starts a fresh playback.

A featured reaction video plays once. When playback ends, the complete card, including the submission row, slides out and fades before it is unmounted. Both queue orientations use `QUEUE_ROW_FEATURED_RUN_APPEAR_TIME` for the entrance and exit duration. A new selection during the exit starts the new card immediately. Buffering and loading errors do not count as playback completion. Other media uses retain their existing looping behavior.

Playback completion hides the card in the current overlay page. Analytics retains the Featured status until it is manually hidden, replaced, or expires. The backend checks expiration every second and then clears both the Analytics and queue Featured states. The submission returns to normal queue retention rules.

Set the display limit in `advanced.json`:

```json
[
  {
    "type": "overrideQueue",
    "featuredRunWaitTimeSeconds": 60
  }
]
```

The default limit is 60 seconds from each successful selection, measured in wall-clock time even after the contest has finished. Selecting another run or selecting the same run again restarts the limit. Set it longer than the video if the entire clip should play: reaching the limit also closes videos that are still playing.

The completed-playback state lives in the current overlay page. Ordinary submission updates and repeated queue snapshots preserve it. Refreshing or opening another overlay before expiration plays the currently selected reaction again. Playback completion does not require the overlay to authenticate to the administration API.

## Force widgets

The `forceWidgets` query parameter selects widgets independently of their visibility in the administration interface. Its value is a JSON array, URL-encoded when constructing a browser-source URL.

Show only the queue:

```text
http://host/overlay?forceWidgets=[{"type":"QueueWidget","widgetId":"queue","widgetLocationId":"queue","settings":{}}]
```

Show an infinite scoreboard:

```text
https://host/overlay?forceWidgets=[{"type":"ScoreboardWidget","widgetId":"scoreboard","widgetLocationId":"scoreboard","settings":{"isInfinite":true,"startFromRow":1,"optimismLevel":"normal","group":"all"}}]
```

Combine a horizontal queue and ticker with custom positions and colors:

```text
https://host/overlay?noStatus&forceWidgets=[{"type":"QueueWidget","widgetId":"queue","widgetLocationId":"customQueue","settings":{"horizontal":true}},{"type":"TickerWidget","widgetId":"ticker","widgetLocationId":"customTicker","statisticsId":"ticker","settings":{}}]&forceVisualConfig={"QUEUE_BACKGROUND_COLOR":"%234C83C300","QUEUE_ROW_BACKGROUND":"%234C83C3","QUEUE_TITLE":"","CONTEST_NAME":"","WIDGET_POSITIONS":{"customQueue":{"positionX":16,"positionY":832,"sizeX":1888,"sizeY":168},"customTicker":{"positionX":16,"positionY":1016,"sizeX":1888,"sizeY":48}}}
```

## Override visual configuration

The `forceVisualConfig` parameter accepts a partial visual configuration as JSON. It overrides the loaded configuration and selected scenes for this overlay page.

```text
http://host/overlay?forceVisualConfig={"QUEUE_TITLE":"Submissions"}
```

## Filter visible widgets

The `onlyWidgets` parameter filters widgets by their IDs. It does not force hidden widgets to appear.

```text
http://host/overlay?onlyWidgets=queue
http://host/overlay?onlyWidgets=teamViewBottomRight,teamViewBottomLeft
```

## Select visual scenes

Declare named partial configurations in `SCENES` to reuse appearances across OBS browser sources. Select a scene with the `visualConfigScene` query parameter.

Scenes apply after the visual configuration file and before `forceVisualConfig`. A scene may contain nested `SCENES`; dot-separated names select a nested chain. Comma-separated chains apply from left to right.

```json
{
  "CONTEST_COLOR": "#4C83C3",
  "SCENES": {
    "dark": {
      "GLOBAL_BACKGROUND_COLOR": "#000000",
      "SCENES": {
        "leftQueue": {
          "WIDGET_POSITIONS": {
            "queue": {
              "positionX": 0,
              "positionY": 0,
              "sizeX": 384,
              "sizeY": 1080
            }
          }
        }
      }
    },
    "noCaption": {
      "CONTEST_CAPTION": ""
    }
  }
}
```

- `http://host/overlay?visualConfigScene=dark` selects a black background.
- `http://host/overlay?visualConfigScene=dark.leftQueue` also moves the queue to the left.
- `http://host/overlay?visualConfigScene=dark,noCaption` combines the black background with an empty caption.
