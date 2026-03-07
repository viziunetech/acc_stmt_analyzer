import { API_BASE } from './licenseDB';

/**
 * Send the CSV expense report to the given email address via the server.
 * @param {{ email: string, csvBase64: string, filename: string, summary: object }} opts
 */
export async function sendEmailReport({ email, csvBase64, filename, summary }) {
  const res = await fetch(`${API_BASE}/email-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, csvBase64, filename, summary }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to send report');
  return data;
}
