import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_RULES } from './rules.js';

export function digestRules(rules) {
  return crypto.createHash('sha256').update(JSON.stringify(rules)).digest('hex');
}

export class RuleStore {
  constructor({ root = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh'), workspace } = {}) {
    this.root = path.join(root, 'approve-for-me');
    this.workspace = workspace;
    this.path = path.join(this.root, workspace ? `workspace-${digestRules([path.resolve(workspace)]).slice(0, 16)}.json` : 'global.json');
    this.state = { version: 1, rules: DEFAULT_RULES, confirmedDigest: digestRules(DEFAULT_RULES) };
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return this.state;
    try {
      const parsed = JSON.parse(await fs.readFile(this.path, 'utf8'));
      if (parsed && Array.isArray(parsed.rules) && typeof parsed.confirmedDigest === 'string') this.state = parsed;
    } catch (error) {
      if (error.code !== 'ENOENT') this.state = { version: 1, rules: [], confirmedDigest: '' };
    }
    this.loaded = true;
    return this.state;
  }

  snapshot() {
    const rulesDigest = digestRules(this.state.rules);
    return { ...this.state, rulesDigest, confirmed: rulesDigest === this.state.confirmedDigest };
  }

  async save(rules) {
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    const next = { version: 1, rules, confirmedDigest: this.state.confirmedDigest };
    await fs.writeFile(this.path, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    this.state = next;
    return this.snapshot();
  }

  async confirm() {
    this.state.confirmedDigest = digestRules(this.state.rules);
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    await fs.writeFile(this.path, `${JSON.stringify(this.state, null, 2)}\n`, { mode: 0o600 });
    return this.snapshot();
  }
}
