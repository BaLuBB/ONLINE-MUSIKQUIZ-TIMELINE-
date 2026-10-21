// Lokaler PeerJS-Signalserver für die P2P-Tests (kein Internet nötig).
import { PeerServer } from 'peer';
const port = Number(process.env.PEER_PORT ?? 9000);
PeerServer({ port, path: '/', host: process.env.PEER_BIND ?? '0.0.0.0', allow_discovery: false });
console.log(`PeerServer läuft auf :${port}`);
