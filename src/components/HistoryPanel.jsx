import React from 'react';
import { FaHistory, FaFolderOpen, FaTrash, FaCalendarAlt } from 'react-icons/fa';

const fmt = (n) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const timeAgo = (isoString) => {
  const diff  = Date.now() - new Date(isoString).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  <  1) return 'just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days  === 1) return 'yesterday';
  return `${days} days ago`;
};

const HistoryPanel = ({ sessions, onLoad, onDelete, onClearAll, onClose }) => (
  <div className="history-backdrop" onClick={onClose}>
    <div className="history-panel" onClick={e => e.stopPropagation()}>

      {/* Header */}
      <div className="history-header">
        <div className="history-title">
          <FaHistory size={14} />
          <span>Recent Sessions</span>
          {sessions.length > 0 && <span className="count-badge">{sessions.length}</span>}
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          {sessions.length > 0 && (
            <button className="history-clear-btn" onClick={onClearAll} title="Remove all history">
              Clear all
            </button>
          )}
          <button className="modal-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>
      </div>

      {/* Body */}
      <div className="history-body">
        {sessions.length === 0 ? (
          <div className="history-empty">
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📂</div>
            <div style={{ fontWeight: 600 }}>No saved sessions yet</div>
            <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: '0.3rem' }}>
              Upload a statement and it will appear here automatically
            </div>
          </div>
        ) : (
          sessions.map(s => (
            <div key={s.id} className="history-entry">
              {/* File name chips + relative time */}
              <div className="history-entry-top">
                <div className="history-entry-files">
                  {s.files.map((f, i) => (
                    <span key={i} className="history-file-chip" title={f.name}>
                      {f.name.replace(/\.(csv|xlsx|xls)$/i, '')}
                    </span>
                  ))}
                </div>
                <span className="history-entry-time">{timeAgo(s.savedAt)}</span>
              </div>

              {/* Stats row */}
              <div className="history-entry-meta">
                <span>🔢 {s.totalTxCount} transactions</span>
                {s.totalSpent > 0 && <span>💸 {fmt(s.totalSpent)}</span>}
                {s.dateRange && (
                  <span>
                    <FaCalendarAlt size={9} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                    {s.dateRange.from} – {s.dateRange.to}
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="history-entry-actions">
                <button className="history-load-btn" onClick={() => onLoad(s)}>
                  <FaFolderOpen size={12} /> Load
                </button>
                <button
                  className="history-delete-btn"
                  onClick={() => onDelete(s.id)}
                  title="Remove this session"
                >
                  <FaTrash size={11} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="history-footer">
        🔒 Saved locally in your browser — never uploaded anywhere
      </div>
    </div>
  </div>
);

export default HistoryPanel;
