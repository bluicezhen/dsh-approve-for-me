import { cp, mkdir, access } from 'node:fs/promises';
import path from 'node:path';

const target = process.env.DSH_PLUGIN_TARGET ?? path.join(process.env.DSH_PROFILE_DIR ?? '', 'node_modules', 'dsh-approve-for-me');
if (!process.env.DSH_PROFILE_DIR) {
  console.error('Set DSH_PROFILE_DIR to the managed profile before syncing.');
  process.exit(1);
}
await mkdir(target, { recursive: true });
await cp(process.cwd(), target, { recursive: true, force: true, filter: (source) => !source.includes(`${path.sep}node_modules${path.sep}`) && !source.includes(`${path.sep}.git${path.sep}`) });
console.log(`synced ${process.cwd()} -> ${target}`);
