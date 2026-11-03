// STUN tells each browser its public address. Phase 8 replaces this with credentials from your own TURN server.
export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
