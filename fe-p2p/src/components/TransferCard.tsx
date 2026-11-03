import { usePeers } from '../hooks/usePeers';
import type { Transfer, TransferStatus } from '../webrtc/fileTransfer';

const ACTIVE: TransferStatus[] = ['hashing', 'offered', 'waiting', 'transferring', 'paused', 'interrupted'];
const SHOW_PROGRESS: TransferStatus[] = ['waiting', 'transferring', 'paused', 'verifying', 'interrupted'];

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function statusText(t: Transfer, peerName: string) {
  const out = t.direction === 'out';
  switch (t.status) {
    case 'hashing':
      return 'Preparing…';
    case 'offered':
      return out ? `Waiting for ${peerName} to accept` : 'Wants to send you this file';
    case 'waiting':
      return 'Starting…';
    case 'transferring':
      return `${formatBytes(t.bytes)} of ${formatBytes(t.size)}`;
    case 'paused':
      return `Paused at ${formatBytes(t.bytes)}`;
    case 'verifying':
      return 'Checking the file…';
    case 'done':
      return out ? 'Delivered and verified' : 'Received and verified';
    case 'failed':
      return "The file didn't match what was sent, so it was discarded";
    case 'cancelled':
      return 'Cancelled';
    case 'rejected':
      return out ? `${peerName} declined` : 'Declined';
    case 'interrupted':
      return out ? `Connection lost. ${peerName} can resume it.` : 'Connection lost. You can resume it.';
  }
}

// One file in the conversation, with progress and the buttons that apply to its current state.
export default function TransferCard({ t, peerName }: { t: Transfer; peerName: string }) {
  const { files } = usePeers();
  const incoming = t.direction === 'in';
  const pct = t.size ? Math.round((t.bytes / t.size) * 100) : 0;

  return (
    <div className={incoming ? 'msg' : 'msg msg-me'}>
      <div className={`file-card file-${t.status}`}>
        <div className="file-head">
          <span className="file-icon" aria-hidden="true">
            {incoming ? '↓' : '↑'}
          </span>
          <div className="file-text">
            <strong title={t.name}>{t.name}</strong>
            <span>
              {formatBytes(t.size)} · {statusText(t, peerName)}
            </span>
          </div>
        </div>

        {SHOW_PROGRESS.includes(t.status) && (
          <progress className="file-progress" value={t.bytes} max={t.size} aria-label={`${t.name}: ${pct}%`} />
        )}

        {t.status === 'done' && t.url && t.mime.startsWith('image/') && (
          <img className="file-preview" src={t.url} alt={t.name} />
        )}

        <div className="file-actions">
          {incoming && t.status === 'offered' && (
            <>
              <button className="btn btn-primary" onClick={() => files.accept(t.id)}>
                Accept
              </button>
              <button className="btn" onClick={() => files.reject(t.id)}>
                Decline
              </button>
            </>
          )}
          {incoming && t.status === 'interrupted' && (
            <button className="btn btn-primary" onClick={() => files.accept(t.id)}>
              Resume
            </button>
          )}
          {t.status === 'transferring' && (
            <button className="btn" onClick={() => files.pause(t.id)}>
              Pause
            </button>
          )}
          {t.status === 'paused' && (
            <button className="btn" onClick={() => files.resume(t.id)}>
              Resume
            </button>
          )}
          {ACTIVE.includes(t.status) && !(incoming && t.status === 'offered') && (
            <button className="btn" onClick={() => files.cancel(t.id)}>
              Cancel
            </button>
          )}
          {t.status === 'done' && t.url && (
            // download= keeps only the file name, so a name like ../../x can't escape the downloads folder
            <a className="btn btn-primary" href={t.url} download={t.name}>
              Save
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
