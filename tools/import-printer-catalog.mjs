// Mechanical conversion of the existing, licensed PrintPeek gzip catalogs.
// Run explicitly with the PrintPeek Assets directory; never translates online.
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {resolve,join} from 'node:path';
const source=process.argv[2];if(!source)throw new Error('Pass the PrintPeek Assets directory');
const target=resolve('supabase/functions/bambu-monitor');
for(const [from,to] of [['hms_en.json.gz','hms-en.json'],['hms_vi_text.json.gz','hms-vi.json']]){
 const data=JSON.parse(gunzipSync(readFileSync(join(source,from))).toString());
 writeFileSync(join(target,to),JSON.stringify(data)+'\n');
}
mkdirSync(join(target,'licenses'),{recursive:true});
for(const name of ['ha-bambulab-MIT.txt','Vietnamese-catalog-attribution.txt'])copyFileSync(join(source,'LICENSES',name),join(target,'licenses',name));
writeFileSync(join(target,'catalog-attribution.json'),JSON.stringify({source:'PrintPeek licensed ha-bambulab catalog',mit:readFileSync(join(source,'LICENSES','ha-bambulab-MIT.txt'),'utf8'),translation:readFileSync(join(source,'LICENSES','Vietnamese-catalog-attribution.txt'),'utf8')})+'\n');
console.log('Converted existing catalogs and retained attribution.');
