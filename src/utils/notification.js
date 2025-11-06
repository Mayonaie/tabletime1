// Notification API helper
// Reads credentials from environment variables to avoid hardcoding secrets in source.
// Set these in a .env.local (not committed):
// REACT_APP_NOTIFICATION_API_PROJECT=cn62zgwnnz1ikv2b22bafp6gbn
// REACT_APP_NOTIFICATION_API_KEY=8fzurr3k8s368ce71hnjibrjloioh6rmzjvc0h5776w6ss07jd97vha6wq

function base64Encode(str) {
  if (typeof btoa === 'function') {
    // Unicode-safe base64 for browsers
    return btoa(unescape(encodeURIComponent(str)));
  }
  return Buffer.from(str, 'utf8').toString('base64');
}

export async function sendNotification({ toEmail, subject, html, text, toId }) {
  const projectId = process.env.REACT_APP_NOTIFICATION_API_PROJECT;
  const apiKey = process.env.REACT_APP_NOTIFICATION_API_KEY;

  if (!projectId || !apiKey) {
    console.error('NotificationAPI env missing:', {
      projectSet: !!projectId,
      keySet: !!apiKey,
    });
    throw new Error('NotificationAPI env vars missing. Define REACT_APP_NOTIFICATION_API_PROJECT and REACT_APP_NOTIFICATION_API_KEY.');
  }

  const url = `https://api.notificationapi.com/${projectId}/sender`;
  const authHeader = 'Basic ' + base64Encode(`${projectId}:${apiKey}`);

  const payload = {
    type: 'send',
    to: {
      id: toId || toEmail,
      email: toEmail,
    },
    email: {
      subject: subject || 'Hello',
      // Provide both text and html for better client compatibility
      text: text || undefined,
      html: html || undefined,
    }
  };

  // helpful diagnostics in development
  if (process.env.NODE_ENV !== 'production') {
    // Do not log secrets
    // eslint-disable-next-line no-console
    console.debug('[NotificationAPI] Sending payload:', {
      url,
      to: payload.to,
      emailPreview: {
        subject: payload.email.subject,
        textLen: payload.email.text ? payload.email.text.length : 0,
        htmlLen: payload.email.html ? payload.email.html.length : 0,
      },
    });
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': authHeader,
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  if (!res.ok) {
    let body;
    try { body = await res.json(); } catch { body = await res.text(); }
    console.error('NotificationAPI error:', res.status, body);
    throw new Error(`NotificationAPI error ${res.status}`);
  }

  return res.json();
}
