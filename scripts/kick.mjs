import { appendFile } from 'node:fs/promises';

const profilePatch = process.env.DSH_PROFILE_PATCH;
if (!profilePatch) {
  console.error('Set DSH_PROFILE_PATCH to the managed profile cordis.patch.yml before kicking host HMR.');
  process.exit(1);
}
await appendFile(profilePatch, `\n# approve-for-me host reload ${Date.now()}\n`);
console.log(`changed ${profilePatch}; host reconcile should reload the plugin`);
