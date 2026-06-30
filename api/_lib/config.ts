export function getIceServers() {
  const stunServers = (process.env.STUN_SERVERS ??
    'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302,stun:stun2.l.google.com:19302')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return stunServers.map((url) => ({ urls: url }));
}
