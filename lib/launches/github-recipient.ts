import { LaunchError } from './policy';

const loginPattern = /^(?!.*--)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const reserved = new Set(['about', 'apps', 'collections', 'contact', 'customer-stories', 'enterprise', 'events', 'explore', 'features', 'issues', 'join', 'login', 'marketplace', 'new', 'notifications', 'orgs', 'organizations', 'pricing', 'pulls', 'readme', 'search', 'security', 'sessions', 'settings', 'signup', 'site', 'sponsors', 'topics', 'trending', 'users']);

/** A repository/subpage names its owner, never the repository or a contributor. */
export function githubRecipientFromUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw invalid(); }
  const owner = url.pathname.split('/')[1];
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com'
    || url.username || url.password || url.port || /[\\\s]/.test(value)
    || !owner || !loginPattern.test(owner) || reserved.has(owner.toLowerCase())) throw invalid();
  return { platform: 'github' as const, login: owner.toLowerCase(), url: `https://github.com/${owner.toLowerCase()}` };
}

function invalid() {
  return new LaunchError('FEE_RECIPIENT', 'Use an HTTPS github.com user or repository link for the fee recipient.');
}

/** Resolve once, then persist this numeric identity with the accepted launch.
 * Does not create a wallet, authorize a claim, or send a transaction.
 */
export async function resolveGithubFeeRecipient(value: string, request: typeof fetch = fetch) {
  const target = githubRecipientFromUrl(value);
  const response = await request(`https://api.github.com/users/${encodeURIComponent(target.login)}`, {
    headers: { Accept: 'application/vnd.github+json' }, redirect: 'error', signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new LaunchError('FEE_RECIPIENT', 'GitHub recipient lookup failed. Retry with a current profile link.');
  const user: unknown = await response.json();
  if (!user || typeof user !== 'object') throw invalid();
  const record = user as Record<string, unknown>;
  if (typeof record.id !== 'number' || !Number.isSafeInteger(record.id) || record.id <= 0
    || typeof record.login !== 'string' || record.login.toLowerCase() !== target.login
    || record.type !== 'User' || record.html_url !== `https://github.com/${record.login}`)
    throw new LaunchError('FEE_RECIPIENT', 'The GitHub recipient must resolve to an individual user with a stable account ID.');
  // Organisation claim authority has not been established for the new portal.
  return { ...target, userId: String(record.id) };
}
