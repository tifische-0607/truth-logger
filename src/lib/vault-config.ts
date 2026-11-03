/** Cloud Vault access routes and the server secrets each one needs (names only; values never leave the server). */
export type CloudRoute = 'direct' | 'relay';

export const CLOUD_SECRETS: Record<CloudRoute, readonly string[]> = {
  direct: ['VAULT_CLOUD_HOST', 'VAULT_CLOUD_PORT', 'VAULT_CLOUD_DATABASE', 'VAULT_CLOUD_USER', 'VAULT_CLOUD_PASSWORD', 'VAULT_CLOUD_SSLMODE'],
  relay: ['VAULT_CLOUD_RELAY_URL', 'VAULT_CLOUD_RELAY_KEY'],
};

export const ROUTE_LABEL: Record<CloudRoute, string> = {
  direct: 'Direct database connection',
  relay: 'HTTPS relay on the hosting account',
};

export type CloudConfigState = { route: CloudRoute; configured: boolean; missing: string[] };

/** A route counts as configured only when every one of its secrets is set to a non-empty value. */
export function cloudConfigState(route: CloudRoute, env: Record<string, string | undefined>): CloudConfigState {
  const missing = CLOUD_SECRETS[route].filter((k) => !(env[k] ?? '').trim());
  return { route, configured: missing.length === 0, missing };
}

export type VaultCheck = { label: string; state: 'passed' | 'failed' | 'not_checked'; note: string };

/** The four checks shown on each card. Nothing passes unless it was actually checked. */
export function cloudChecks(state: CloudConfigState): VaultCheck[] {
  const why = state.configured
    ? 'Not attempted: outside connections are not permitted in this phase'
    : `Not configured: ${state.missing.join(', ')} not set`;
  return ['Reachable', 'TLS', 'Schema version', 'Write test'].map((label) => ({ label, state: 'not_checked' as const, note: why }));
}

export function homeChecks(input: { online: boolean; httpsGateway: boolean; lastVerifiedWrite: boolean; windowMinutes: number }): VaultCheck[] {
  return [
    { label: 'Reachable', state: input.online ? 'passed' : 'failed',
      note: input.online ? `Reported online within ${input.windowMinutes} minutes` : `No online report within ${input.windowMinutes} minutes` },
    { label: 'TLS', state: input.httpsGateway ? 'passed' : 'not_checked', note: input.httpsGateway ? 'Gateway address uses HTTPS' : 'No gateway address set' },
    { label: 'Schema version', state: 'not_checked', note: 'DarkNight does not report a schema version yet' },
    { label: 'Write test', state: input.lastVerifiedWrite ? 'passed' : 'not_checked',
      note: input.lastVerifiedWrite ? 'A capture write was verified by SHA-256' : 'No verified write recorded yet' },
  ];
}

export type VaultWord = 'Online' | 'Offline' | 'Not configured';
export function cloudWord(configured: boolean, online: boolean): VaultWord {
  return !configured ? 'Not configured' : online ? 'Online' : 'Offline';
}
