import { getAddress, isAddress, zeroAddress } from 'viem';
import { LaunchError } from './policy';
import { githubRecipientFromUrl } from './github-recipient';

/** Ground the destination in operative user text, never model output or metadata.
 * Resolution of a handle to its immutable X ID and wallet happens separately.
 * This parser does not grant authority to launch or provision a wallet.
 */
function feeAssignmentSource(text:string){
  return text.replace(/"[^"\n]*"|“[^”\n]*”|'[^'\n]*'|‘[^’\n]*’/g, value => ' '.repeat(value.length))
    .replace(/\b(?:description|desc)\s*(?::|=|is\b)?[^;\n]*/gi, value => {
      if(/\b(?:assign|allocate|direct|send|route)\s+(?:(?:the\s+)?(?:creator\s+)?fees\s+)?to\b/i.test(value))throw new LaunchError('FEE_RECIPIENT','Keep fee assignment outside an unquoted description, separated by a semicolon or newline.');
      return ' '.repeat(value.length);
    });
}
export function launchFeeRecipientFromXText(text: string) {
  if (text.length > 10_000) throw new LaunchError('FEE_RECIPIENT', 'Launch command is too long.');
  const source=feeAssignmentSource(text);
  const pattern = /\b(?:assign|allocate|direct|send|route)\s+(?:(?:the\s+)?(?:creator\s+)?fees\s+)?to\s+([^\s,;!?]+)/gi;
  const matches = [...source.matchAll(pattern)];
  if (!matches.length) {
    if (/\b(?:assign|allocate|direct|send|route)\s+(?:(?:the\s+)?(?:creator\s+)?fees\s+)?to\b/i.test(source))
      throw new LaunchError('FEE_RECIPIENT', 'Specify a complete fee recipient.');
    return undefined;
  }
  if (matches.length !== 1) throw new LaunchError('FEE_RECIPIENT', 'Specify one fee recipient.');
  const match = matches[0];
  const prefix = source.slice(Math.max(0, match.index! - 80), match.index);
  if (/\b(?:not|never|don't|dont|do\s+not)\b[^;]*$/i.test(prefix))
    throw new LaunchError('FEE_RECIPIENT', 'State one positive fee assignment.');
  const suffix = source.slice(match.index! + match[0].length);
  if (/^\s*(?:(?:or|and)\s+|[,/]\s*)(?:@|0x|https?:|github\.)/i.test(suffix))
    throw new LaunchError('FEE_RECIPIENT', 'Specify one fee recipient.');
  const recipient = match[1].replace(/\.$/, '');
  if (/^https?:\/\//i.test(recipient)) return githubRecipientFromUrl(recipient).url;
  if (/^@[a-zA-Z0-9_]{1,15}$/.test(recipient)) return recipient.toLowerCase();
  if (/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
    try {
      if (!isAddress(recipient, { strict: true })) throw new Error('Invalid checksum');
      const address = getAddress(recipient);
      if (address !== zeroAddress) return address;
    } catch { /* Reject invalid mixed-case checksums. */ }
  }
  throw new LaunchError('FEE_RECIPIENT', 'Use an X handle, GitHub user or repository link, or a complete nonzero wallet address for the fee recipient.');
}

/** Until the new execution adapter is verified, never drop a requested recipient
 * and launch through the legacy creator-only portal instead.
 */
export function assertLegacyLaunchHasNoFeeAssignment(text: string) {
  if (launchFeeRecipientFromXText(text))
    throw new LaunchError('FEE_RECIPIENT_UNAVAILABLE', 'Fee assignment through the new portal is not available yet. This launch has not been submitted.');
}

export function withoutLaunchFeeAssignment(text:string){
  const recipient=launchFeeRecipientFromXText(text);
  if(!recipient)return text;
  const match=feeAssignmentSource(text).matchAll(/\b(?:assign|allocate|direct|send|route)\s+(?:(?:the\s+)?(?:creator\s+)?fees\s+)?to\s+[^\s,;!?]+/gi).next().value!;
  return text.slice(0,match.index)+' '.repeat(match[0].length)+text.slice(match.index+match[0].length);
}
