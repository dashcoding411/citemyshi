// Safe outbound fetching for user-supplied URLs: only http(s), and every
// connection (including redirects) must resolve to a public IP address.
import dns from 'node:dns';
import net from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7));
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80') || v6.startsWith('ff');
}

function safeLookup(hostname, options, cb) {
  dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
    if (err) return cb(err);
    const list = Array.isArray(addrs) ? addrs : [{ address: addrs, family: options.family || 4 }];
    const bad = list.find(a => isPrivateIp(a.address));
    if (bad) return cb(Object.assign(new Error('That address isn’t allowed'), { code: 'EBLOCKED' }));
    if (options.all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
}

export const safeDispatcher = new Agent({ connect: { lookup: safeLookup } });

export function assertPublicUrl(u) {
  const url = new URL(u);
  if (!/^https?:$/.test(url.protocol)) throw new Error('Only http and https links can be cited');
  if (net.isIP(url.hostname.replace(/^\[|\]$/g, '')) && isPrivateIp(url.hostname.replace(/^\[|\]$/g, ''))) throw new Error('That address isn’t allowed');
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(url.hostname)) throw new Error('That address isn’t allowed');
  return url;
}

// Redirects are followed by hand so every hop (including raw-IP ones,
// which never hit DNS) is checked.
export async function safeFetch(url, opts = {}) {
  let current = url;
  for (let hop = 0; hop <= 6; hop++) {
    assertPublicUrl(current);
    const res = await undiciFetch(current, { ...opts, redirect: 'manual', dispatcher: safeDispatcher });
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) {
      res.body?.cancel().catch(() => {});
      current = new URL(loc, current).toString();
      continue;
    }
    Object.defineProperty(res, 'url', { value: current });
    return res;
  }
  throw new Error('Too many redirects');
}
