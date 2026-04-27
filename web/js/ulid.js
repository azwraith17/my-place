// Client-side ULID generator (no dependencies)
const CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function ulid() {
  const now = Date.now();
  let ts = '';
  let n = now;
  for (let i = 0; i < 10; i++) {
    ts = CHARS[n & 31] + ts;
    n = Math.floor(n / 32);
  }
  let rand = '';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  for (const b of bytes) {
    rand += CHARS[b % 32];
  }
  return ts + rand;
}
