# PlaybackKeys

A Chromium extension that drives in-page video with global keyboard shortcuts, so the user can control a tutorial or lecture without focusing the video tab.

## Language

**Built-in site**:
A host PlaybackKeys always treats as in-scope, without the user granting optional host permission.
_Avoid_: default site, supported site

**Opt-in origin**:
A non-built-in origin the user enabled from the popup.
_Avoid_: custom site, extra site, supported site

**Command**:
A global chord PlaybackKeys registers with the browser. The set is: play/pause, speed up, speed down, reset speed, switch target tab, and one skip-back plus one skip-forward per Skip interval.
_Avoid_: shortcut (the site's own keys), hotkey

**Skip interval**:
A configured jump length in seconds, shared symmetrically by one skip-back Command and its matching skip-forward Command. PlaybackKeys has three Skip intervals.
_Avoid_: seek step, jump size, skip amount, seekSeconds (storage name)

**Skip burst**:
A contiguous run of same-direction skips on one Skip interval that share one cumulative toast readout.
_Avoid_: merge session, seek streak, combo

**Controllable video**:
The in-page media PlaybackKeys actually drives. On a generic site this is the prominent HTML `<video>`; a Built-in site may substitute a site-specific stand-in.
_Avoid_: player (that word means the site's chrome and API), stream, DASH

**Hostile player**:
A site player that overwrites play, pause, or rate after PlaybackKeys writes them.
_Avoid_: anti-extension, fightback

**Picture-in-Picture**:
The browser video Picture-in-Picture window (the same Controllable video via `HTMLVideoElement.requestPictureInPicture`). Another presentation of that video, not a second player.
_Avoid_: mini-player, 小窗, 画中画 (unqualified), Document Picture-in-Picture (a separate browser window that can host a whole page)

**Site mini-player**:
The site's own corner player chrome, distinct from Picture-in-Picture.
_Avoid_: Picture-in-Picture, 画中画

**Bilibili VOD page**:
A watch page under `www.bilibili.com/video/` or `www.bilibili.com/list/`.
_Avoid_: Bilibili (unqualified), B-site video

**Bangumi page**:
A watch page under `www.bilibili.com/bangumi/play/`.
_Avoid_: anime page, season page, episode page
