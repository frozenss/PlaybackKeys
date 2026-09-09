# Bilibili is a Built-in Hostile player

PlaybackKeys treats Bilibili VOD pages and Bangumi pages as a Built-in site. Opt-in already fails there: the player overwrites play, pause, and rate, and may replace the HTML `<video>` with a site-specific media element, so a generic probe and a 5s rate window are not enough. Drive it as a Hostile player: `window.player` for play/pause/seek when present, always write rate on the Controllable video, never fetch streams, and keep the adapter site-specific.

**Status:** accepted

## Considered options

- **Opt-in only.** Rejected: the user can already grant the origin and Commands still do nothing. Permission width is not the bug.
- **Media node only, or `window.player` only.** Rejected: the media node desyncs from the player's timeline; the player API is the wrong place to win the login-wall rate fight.
- **Fetch playurl / reimplement DASH.** Rejected: PlaybackKeys never downloads media and must not become a Bilibili player.
- **Generic “custom media element” probe for every site.** Rejected: v1 is a Bilibili adapter. Extract a shared helper only if it is a few lines, low risk, and leaves other sites unchanged.
- **Cap rate at Bilibili’s 2×, or restyle the site speed menu.** Rejected: Commands use the global speed max; feedback is PlaybackKeys’ toast. The site’s own speed chrome may stay wrong.
- **Treat Picture-in-Picture as a new mode.** Rejected: it is the same Controllable video in the browser video PiP window (confirmed: `document.pictureInPictureElement` is `VIDEO`, not Document Picture-in-Picture).

## Consequences

- `host_permissions` is `*://www.bilibili.com/*` only. Bind only on `/video/`, `/list/`, and `/bangumi/play/`.
- Desired rate sticks until the user resets or the watch identity changes (BV / cid). A quality or custom-element swap on the same watch keeps the rate.
- In-page navigation (season, multi-P, Bangumi episode) is in v1: Commands must drive the new Controllable video.
- The site custom media element is a Controllable video stand-in on watch pages.
- If a browser Picture-in-Picture window is open, Commands must still work. If the custom element cannot enter PiP, that is Bilibili’s limit, not ours.
- Out of v1: live, cheese, embeds, `m.`, `bilibili.tv`, the homepage Document Picture-in-Picture queue, Site mini-player off a watch page, stream picking, player-chrome restyle.
