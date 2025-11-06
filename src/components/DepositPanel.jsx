import React, { useState } from 'react';
import { PayPalButtons } from '@paypal/react-paypal-js';

const API_BASE =
  process.env.NODE_ENV === 'production'
    ? '' // same-origin in production when served by Express
    : (process.env.REACT_APP_API_BASE || 'http://localhost:4000');

export default function DepositPanel({ open, reservation, deposit, total, onClose, onSuccess }) {
  const [showPay, setShowPay] = useState(false);
  if (!open) return null;

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="panel">
        <div className="panel-header">
          <h3>Pay Reservation Deposit</h3>
          <button className="close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="panel-body">
          <div className="meta">
            <div><strong>Name:</strong> {reservation?.name}</div>
            <div><strong>Party size:</strong> {reservation?.partySize}</div>
            <div><strong>Time:</strong> {reservation?.time} on {reservation?.date}</div>
          </div>
          <div className="amounts">
            Total: ${Number(total).toFixed(2)} • deposit (20%): <strong>${Number(deposit).toFixed(2)}</strong>
          </div>
          {!showPay && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowPay(true)}
              style={{ margin: '.25rem 0' }}
            >
              Pay deposit with PayPal
            </button>
          )}
          {showPay && (
            <PayPalButtons
              style={{ layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal' }}
              createOrder={async () => {
                try {
                  const res = await fetch(`${API_BASE}/api/paypal/create-order`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      amount: Number(deposit || 0).toFixed(2),
                      description: `Deposit for reservation ${reservation?.id}`,
                      currency: 'USD'
                    }),
                  });
                  if (!res.ok) {
                    const txt = await res.text();
                    console.error('create-order failed:', res.status, txt);
                    try {
                      const parsed = JSON.parse(txt);
                      alert(`Create order failed: ${parsed?.detail?.details?.[0]?.issue || parsed?.detail?.name || res.status}`);
                    } catch {
                      alert(`Create order failed: HTTP ${res.status}`);
                    }
                    throw new Error('create-order failed');
                  }
                  const data = await res.json();
                  return data.id;
                } catch (e) {
                  console.error('create-order exception:', e);
                  alert(`Create order error: ${e?.message || e}`);
                  throw e;
                }
              }}
              onApprove={async (data, actions) => {
                try {
                  const res = await fetch(`${API_BASE}/api/paypal/capture-order`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ orderID: data.orderID }),
                  });
                  if (!res.ok) {
                    const txt = await res.text();
                    console.error('capture failed:', res.status, txt);
                    try {
                      const parsed = JSON.parse(txt);
                      const issue = parsed?.detail?.details?.[0]?.issue || parsed?.name || parsed?.detail?.name;
                      if (issue === 'INSTRUMENT_DECLINED' || issue === 'PAYER_ACTION_REQUIRED') {
                        if (actions?.restart) {
                          console.warn('Restarting PayPal checkout due to issue:', issue);
                          return actions.restart();
                        }
                      }
                      alert(`Capture failed: ${issue || res.status}`);
                    } catch {
                      alert(`Capture failed: HTTP ${res.status}`);
                    }
                    throw new Error('capture failed');
                  }
                  const details = await res.json();
                  onSuccess?.(details);
                  alert('Payment successful!');
                } catch (e) {
                  console.error('capture-order exception:', e);
                  alert(`Capture error: ${e?.message || e}`);
                  throw e;
                }
              }}
              onError={(err) => {
                console.error('PayPal SDK onError:', err);
                try {
                  const msg = typeof err === 'string' ? err : (err?.message || JSON.stringify(err));
                  alert(`PayPal error: ${msg}`);
                } catch {
                  alert('PayPal error occurred. Check console for details.');
                }
              }}
            />
          )}
        </div>
      </div>

      <style>{`
        .overlay { 
          position: fixed; 
          inset: 0; 
          background: rgba(0,0,0,0.5); 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          z-index: 1000;
          backdrop-filter: blur(4px);
          animation: fadeIn 0.2s ease;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .panel { 
          width: 480px; 
          max-width: 92vw; 
          background: #fff; 
          border-radius: 20px; 
          border: none;
          box-shadow: 0 20px 60px rgba(0,0,0,0.2);
          animation: slideUp 0.3s ease;
        }
        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translateY(20px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }
        .panel-header { 
          display:flex; 
          align-items:center; 
          justify-content:space-between; 
          padding: 1.25rem 1.5rem; 
          border-bottom: 2px solid var(--muted-200, #e6e7eb); 
        }
        .panel-header h3 {
          margin: 0;
          color: var(--text-900);
          font-size: 1.5rem;
          font-weight: 700;
        }
        .panel-body { 
          padding: 1.5rem; 
          display: grid; 
          gap: 1.25rem; 
        }
        .meta { 
          display:grid; 
          gap: 0.5rem; 
          color: var(--text-700, #344054);
          padding: 1rem;
          background: var(--cream-50);
          border-radius: 12px;
          border: 2px solid var(--muted-100);
        }
        .meta div {
          display: flex;
          gap: 0.5rem;
        }
        .meta strong {
          color: var(--navy-600);
          font-weight: 600;
        }
        .amounts { 
          font-size: 1.1rem; 
          font-weight: 600;
          color: var(--text-900);
          padding: 0.75rem;
          background: linear-gradient(135deg, rgba(27,74,132,0.05), rgba(17,50,95,0.08));
          border-radius: 10px;
          border: 2px solid rgba(27, 74, 132, 0.1);
        }
        .amounts strong {
          color: var(--navy-600);
          font-size: 1.15em;
        }
        .close { 
          background:none; 
          border:none; 
          font-size: 1.75rem; 
          cursor:pointer;
          color: var(--text-600);
          width: 2rem;
          height: 2rem;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          transition: all 0.2s ease;
        }
        .close:hover {
          background: var(--muted-100);
          color: var(--text-900);
          transform: scale(1.1);
        }
      `}</style>
    </div>
  );
}