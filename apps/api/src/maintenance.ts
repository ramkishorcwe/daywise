import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { emptyMaintenance, maintenanceContentSchema, maintenanceProposalSchema, maintenanceStateSchema, reviewProblems, currentFood, type MaintenanceState, type MaintenanceProposal } from '../../../packages/data-adapters/src/maintenance';
import { ApiError, stale } from './errors';

export const proposalDigest = (proposal: MaintenanceProposal) => createHash('sha256').update(JSON.stringify(proposal)).digest('hex');
const alias = z.string().regex(/^[a-zA-Z0-9_-]{2,80}$/);
// Offline operator tooling, protected by OS file access. It has no HTTP write endpoint.
// Aliases are review attestations, not independently authenticated reviewer identities.
export class MaintenanceStore {
  constructor(private directory: string, private clock = () => Date.now()) {}
  async read(): Promise<MaintenanceState> {
    try { const raw = await readFile(join(this.directory, 'state.json'), 'utf8'); if (raw.length > 3_000_000) throw new Error('Maintenance state is too large.'); return maintenanceStateSchema.parse(JSON.parse(raw)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyMaintenance(); throw error; }
  }
  private async locked<T>(work: () => Promise<T>) {
    await mkdir(this.directory, { recursive: true });
    let lock;
    try { lock = await open(join(this.directory, 'writer.lock'), 'wx', 0o600); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new ApiError(409, 'MAINTENANCE_LOCKED', 'Another writer or an interrupted operation holds the lock. Check the runbook.'); throw error; }
    try { return await work(); } finally { await lock.close(); await unlink(join(this.directory, 'writer.lock')); }
  }
  async stage(content: unknown, baseRevision: number, submitter: string, reason: string) {
    return this.locked(async () => {
      if ((await this.read()).revision !== baseRevision) throw stale();
      const files = (await readdir(this.directory)).filter(file => file.startsWith('proposal-') && file.endsWith('.json'));
      if (files.length >= 100) throw new ApiError(429, 'MAINTENANCE_CAPACITY', 'Review or remove obsolete proposals before adding more.');
      const timestamp = this.clock();
      const proposal = maintenanceProposalSchema.parse({ schemaVersion: 1, id: randomUUID(), baseRevision, submittedAt: new Date(timestamp).toISOString(), expiresAt: new Date(timestamp + 86400000).toISOString(), submitter: alias.parse(submitter), reason, content: maintenanceContentSchema.parse(content) });
      await writeFile(join(this.directory, `proposal-${proposal.id}.json`), JSON.stringify(proposal), { flag: 'wx', mode: 0o600 });
      return { id: proposal.id, digest: proposalDigest(proposal), baseRevision, expiresAt: proposal.expiresAt, problems: reviewProblems(proposal.content, timestamp) };
    });
  }
  async inspect(id: string) {
    z.uuid().parse(id);
    const raw = await readFile(join(this.directory, `proposal-${id}.json`), 'utf8');
    if (raw.length > 3_000_000) throw new Error('Proposal is too large.');
    const proposal = maintenanceProposalSchema.parse(JSON.parse(raw));
    if (proposal.id !== id) throw new Error('Proposal identity mismatch.');
    return proposal;
  }
  async decide(id: string, digest: string, baseRevision: number, reviewer: string, approve: boolean) {
    return this.locked(async () => {
      const proposal = await this.inspect(id), state = await this.read();
      alias.parse(reviewer);
      if (proposalDigest(proposal) !== digest) throw new ApiError(409, 'PROPOSAL_CHANGED', 'The proposal differs from the reviewed digest. Inspect it again.');
      if (state.revision !== baseRevision || (approve && proposal.baseRevision !== baseRevision)) throw stale();
      if (approve) {
        if (proposal.submitter === reviewer) throw new ApiError(422, 'REVIEWER_REQUIRED', 'Record a separate reviewer attestation before approval.');
        if (Date.parse(proposal.expiresAt) <= this.clock()) throw new ApiError(409, 'PROPOSAL_EXPIRED', 'Stage a fresh proposal after rechecking its evidence.');
        const problems = reviewProblems(proposal.content, this.clock());
        if (problems.length) throw new ApiError(422, 'EVIDENCE_NOT_CURRENT', problems.join(' '));
        for (const city of proposal.content.catalog.cities) {
          const previous = state.content.catalog.cities.find(value => value.id === city.id);
          if (previous && JSON.stringify(previous) !== JSON.stringify(city) && previous.catalogVersion === city.catalogVersion) throw new ApiError(422, 'CATALOG_VERSION_REQUIRED', 'Changed city content requires a new catalogVersion.');
        }
        const next = maintenanceStateSchema.parse({ ...state, revision: state.revision + 1, content: proposal.content, audit: [...state.audit, { proposalId: id, submitter: proposal.submitter, reviewer, at: new Date(this.clock()).toISOString(), digest, fromRevision: state.revision }].slice(-100) });
        const temporary = join(this.directory, `state-${randomUUID()}.tmp`);
        try { await writeFile(temporary, JSON.stringify(next), { flag: 'wx', mode: 0o600 }); await rename(temporary, join(this.directory, 'state.json')); }
        catch (error) { await unlink(temporary).catch(() => {}); throw error; }
      }
      await unlink(join(this.directory, `proposal-${id}.json`));
      return { decision: approve ? 'approved' : 'rejected', revision: state.revision + (approve ? 1 : 0), restartRequired: approve };
    });
  }
  async status() { const state = await this.read(); return { revision: state.revision, cities: state.content.catalog.cities.length, foodRecords: state.content.food.length, currentFoodAssertions: currentFood(state.content, this.clock()).filter(row => row.effectiveStatus !== 'unknown').length, problems: reviewProblems(state.content, this.clock()), livePlanning: false }; }
}
