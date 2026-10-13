export function checkClientSecrets(directory: string, env?: Record<string, string | undefined>): Promise<{ passed: boolean; findings: number; note: string }>;
