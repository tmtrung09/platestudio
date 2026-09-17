# Optional Liquid Glass

Settings → Liquid Glass is off by default and saved in localStorage on this device.
The change applies on the next reload; we never reload automatically while work or uploads may be pending.

`liquid-gl@2.2.4` is MIT licensed. `npm run build:glass` copies the original module and license verbatim. No shader, animation, resolution, tint or lifecycle patches are applied. Decorative proxies keep navigation hit targets intact. The app only synchronizes their geometry and refreshes snapshots after nested scrolling or theme changes.

The original library owns its GPU lifecycle and animation loops. Turning the option off and reloading fully releases those resources. The default CSS interface downloads no liquidGL code. GPU failures leave CSS glass available. The optical enhancement targets mobile navigation and the Menu sheet; desktop retains its existing layout.

Scroll scheduling: passive scroll handlers only mark the snapshot dirty. Fixed-lens geometry is unchanged during nested scrolling, so the adapter performs no layout reads/writes there. Content mutations share the same scheduler. After a 500 ms quiet period, an idle callback coalesces updates into one capture; a new scroll cancels queued work. The previous glass texture stays visible while scrolling. Geometry is refreshed only for navigation, menu transitions, theme and viewport changes, and unchanged styles are not rewritten. This preserves the original shader and resolution; it does not promise a device-independent frame rate or eliminate the upstream renderer's own per-frame work.

Run `npm run qa:glass` and `npm run qa:all`. Physical iPhone Safari testing is still needed.
