import { API_BASE } from './licenseDB';

export async function sendContactMessage({ name, email, subject, message, website } = {}) {
  const res = await fetch(`${API_BASE}/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: name || '',
      email: email || '',
      subject: subject || '',
      message: message || '',
      website: website || '',
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not send message');
  return data; // { ok: true }
}
