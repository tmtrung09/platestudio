// Ship the pinned upstream distribution verbatim, including its MIT license.
import {copyFileSync,mkdirSync} from 'node:fs';
const root=new URL('../',import.meta.url);
mkdirSync(new URL('assets/vendor/',root),{recursive:true});
copyFileSync(new URL('node_modules/liquid-gl/liquidGL.js',root),new URL('assets/vendor/liquidGL.js',root));
copyFileSync(new URL('node_modules/liquid-gl/LICENSE',root),new URL('assets/vendor/liquidGL.LICENSE',root));
console.log('Copied original liquidGL (no shader or lifecycle patches).');
