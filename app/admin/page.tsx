'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/src/lib/supabase';

interface LogRow {
  id: string;
  created_at: string;
  event_type: string;
  player_id: string | null;
  player_email: string | null;
  metadata: Record<string, unknown>;
  severity: string;
}

interface LogsResponse {
  logs: LogRow[];
  total: number;
  page: number;
  pageSize: number;
  error?: string;
}

const EVENT_TYPES = ['', 'tenks_earn', 'tenks_spend', 'purchase', 'player_login', 'server_error'];
const SEVERITIES  = ['', 'info', 'warn', 'error'];

const SEVERITY_COLOR: Record<string, string> = {
  info:  '#46B3FF',
  warn:  '#F5C842',
  error: '#FF006E',
};

const TYPE_COLOR: Record<string, string> = {
  tenks_earn:   '#39FF14',
  tenks_spend:  '#F5C842',
  purchase:     '#a855f7',
  player_login: '#46B3FF',
  server_error: '#FF006E',
};

export default function AdminLogsPage() {
  const [token, setToken]       = useState<string | null>(null);
  const [authed, setAuthed]     = useState<boolean | null>(null); // null = loading
  const [logs, setLogs]         = useState<LogRow[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [typeFilter, setTypeFilter]         = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  // Get Supabase session token
  useEffect(() => {
    if (!supabase) { setAuthed(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      const t = data.session?.access_token ?? null;
      setToken(t);
      setAuthed(t !== null);
    });
  }, []);

  const fetchLogs = useCallback(async (pg: number, type: string, sev: string) => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(pg) });
      if (type) params.set('type', type);
      if (sev)  params.set('severity', sev);
      const res = await fetch(`/api/admin/logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data: LogsResponse = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Error desconocido');
        setLogs([]);
      } else {
        setLogs(data.logs);
        setTotal(data.total);
        setPageSize(data.pageSize);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fetch failed');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) void fetchLogs(page, typeFilter, severityFilter);
  }, [token, page, typeFilter, severityFilter, fetchLogs]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  /* ── UI ── */

  if (authed === null) {
    return <Centered>Cargando sesión…</Centered>;
  }

  if (!authed) {
    return <Centered>No autenticado. Iniciá sesión en <a href="/play" style={{ color: '#46B3FF' }}>/play</a> primero.</Centered>;
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0E0E14',
        color: '#e0e0e8',
        fontFamily: 'monospace',
        padding: '24px 32px',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 24, borderBottom: '1px solid rgba(245,200,66,0.2)', paddingBottom: 16 }}>
        <h1 style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 14, color: '#F5C842', margin: 0, marginBottom: 6 }}>
          WASPI ADMIN
        </h1>
        <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
          Event logs — {total.toLocaleString('es-AR')} eventos totales
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <Select
          label="Tipo"
          value={typeFilter}
          options={EVENT_TYPES}
          onChange={v => { setTypeFilter(v); setPage(1); }}
        />
        <Select
          label="Severity"
          value={severityFilter}
          options={SEVERITIES}
          onChange={v => { setSeverityFilter(v); setPage(1); }}
        />
        <button
          onClick={() => void fetchLogs(page, typeFilter, severityFilter)}
          style={btnStyle}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ color: '#FF006E', fontSize: 12, marginBottom: 16, padding: '8px 12px', border: '1px solid rgba(255,0,110,0.3)', background: 'rgba(255,0,110,0.06)' }}>
          {error}
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left' }}>
              {['Fecha', 'Tipo', 'Player email', 'Severity', 'Metadata'].map(h => (
                <th key={h} style={{ padding: '8px 12px', color: 'rgba(255,255,255,0.45)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>Cargando…</td></tr>
            )}
            {!loading && logs.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>Sin resultados</td></tr>
            )}
            {!loading && logs.map(row => (
              <>
                <tr
                  key={row.id}
                  onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    cursor: 'pointer',
                    background: expanded === row.id ? 'rgba(255,255,255,0.04)' : 'transparent',
                  }}
                >
                  <td style={{ padding: '7px 12px', color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>
                    {new Date(row.created_at).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}
                  </td>
                  <td style={{ padding: '7px 12px', whiteSpace: 'nowrap' }}>
                    <span style={{
                      color: TYPE_COLOR[row.event_type] ?? '#fff',
                      background: `${TYPE_COLOR[row.event_type] ?? '#fff'}15`,
                      border: `1px solid ${TYPE_COLOR[row.event_type] ?? '#fff'}30`,
                      padding: '2px 7px',
                      fontSize: 11,
                    }}>
                      {row.event_type}
                    </span>
                  </td>
                  <td style={{ padding: '7px 12px', color: 'rgba(255,255,255,0.65)' }}>
                    {row.player_email ?? <span style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>}
                  </td>
                  <td style={{ padding: '7px 12px' }}>
                    <span style={{ color: SEVERITY_COLOR[row.severity] ?? '#fff', fontSize: 11 }}>
                      {row.severity}
                    </span>
                  </td>
                  <td style={{ padding: '7px 12px', color: 'rgba(255,255,255,0.4)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {JSON.stringify(row.metadata)}
                  </td>
                </tr>
                {expanded === row.id && (
                  <tr key={`${row.id}-detail`} style={{ background: 'rgba(255,255,255,0.025)' }}>
                    <td colSpan={5} style={{ padding: '10px 24px 12px' }}>
                      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, marginBottom: 4 }}>PLAYER ID</div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>{row.player_id ?? '—'}</div>
                        </div>
                        <div>
                          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, marginBottom: 4 }}>METADATA</div>
                          <pre style={{ margin: 0, fontSize: 11, color: '#46B3FF', maxWidth: 400, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                            {JSON.stringify(row.metadata, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ marginTop: 20, display: 'flex', gap: 10, alignItems: 'center', fontSize: 12 }}>
        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={btnStyle}>
          ← Prev
        </button>
        <span style={{ color: 'rgba(255,255,255,0.4)' }}>
          Página {page} / {totalPages}
        </span>
        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={btnStyle}>
          Next →
        </button>
      </div>
    </div>
  );
}

/* ── Helpers ── */

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#0E0E14', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace', color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>
      {children}
    </div>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
      {label}:
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.12)',
          color: '#e0e0e8',
          padding: '4px 8px',
          cursor: 'pointer',
          fontSize: 12,
        }}
      >
        {options.map(o => (
          <option key={o} value={o} style={{ background: '#1a1a24' }}>
            {o || '— todos —'}
          </option>
        ))}
      </select>
    </label>
  );
}

const btnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.12)',
  color: '#e0e0e8',
  padding: '5px 12px',
  cursor: 'pointer',
  fontSize: 12,
  fontFamily: 'monospace',
};
