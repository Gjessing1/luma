// Business logic lives in packages/*, never in UI components or route handlers.
// Apps and the backend are thin adapters over what is exported here.

export interface HealthReport {
  ok: boolean;
  name: string;
  version: string;
  // Commit the running image was built from; lets CI and the status page prove
  // a deploy actually took. Empty in local dev.
  gitSha: string;
}

export function describeVersion(report: HealthReport): string {
  if (report.gitSha === '') {
    return `${report.name} ${report.version} (dev)`;
  }
  return `${report.name} ${report.version} (${report.gitSha.slice(0, 7)})`;
}
