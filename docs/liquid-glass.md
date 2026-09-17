# Optional Liquid Glass

Settings → Liquid Glass is off by default and saved in localStorage on this device.
The change applies on the next reload; we never reload automatically while work or uploads may be pending.

`liquid-gl@2.2.4` is MIT licensed. `npm run build:glass` copies the original module and license verbatim. No shader, animation, resolution, tint or lifecycle patches are applied. Decorative proxies keep navigation hit targets intact. The app only synchronizes their geometry and refreshes snapshots after nested scrolling or theme changes.

The original library owns its GPU lifecycle and animation loops. Turning the option off and reloading fully releases those resources. The default CSS interface downloads no liquidGL code. GPU failures leave CSS glass available. The optical enhancement targets mobile navigation and the Menu sheet; desktop retains its existing layout.

Run `npm run qa:glass` and `npm run qa:all`. Physical iPhone Safari testing is still needed.
