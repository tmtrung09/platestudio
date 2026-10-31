// Prepare an auditable SQL request; execute it separately with the authenticated admin CLI.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const workspace=process.argv.find(a=>a.startsWith('--workspace='))?.slice(12);
if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(workspace||''))throw new Error('Required: --workspace=<uuid> [--apply]');
const catalog=JSON.parse(readFileSync('assets/filaments/reference-palette.json','utf8'));
const literal=JSON.stringify(catalog).replaceAll("'","''");
const apply=process.argv.includes('--apply'),dir=resolve('qa-results/filament-palette');mkdirSync(dir,{recursive:true});
const path=resolve(dir,apply?'apply.sql':'dry-run.sql');
writeFileSync(path,`select public.import_filament_reference_palette('${workspace}'::uuid,'${literal}'::jsonb,${apply}) as result;\n`);
console.log(JSON.stringify({path,mode:apply?'apply':'dry-run',colors:catalog.colors.length}));
