/** Retired execution paths cannot be enabled by deployment environment settings. */
export function retiredFeatureEnabled(): boolean { return false; }
/** Compatibility for internal legacy configuration objects, never read from the environment. */
export function retiredFeatureEnvironmentValue(): string { return "false"; }
