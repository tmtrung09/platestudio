// Ship the pinned upstream bundle verbatim (includes its html-to-image dependency).
import {copyFileSync,mkdirSync} from 'node:fs';
const root=new URL('../',import.meta.url);
mkdirSync(new URL('assets/vendor/',root),{recursive:true});
copyFileSync(new URL('node_modules/@ybouane/liquidglass/dist/index.js',root),new URL('assets/vendor/ybouane-liquidglass.js',root));
copyFileSync(new URL('node_modules/@ybouane/liquidglass/dist/index.js.map',root),new URL('assets/vendor/index.js.map',root));
console.log('Copied original @ybouane/liquidglass 1.0.3.');
