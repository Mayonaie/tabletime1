import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReservationForm from './ReservationForm';
import ReservationList from './ReservationList';
import { sendNotification } from '../utils/notification';
import DepositPanel from './DepositPanel';

// Config: adjust as needed
const RESTAURANT_CAPACITY = 40; // total seats available per time slot
const TIME_SLOTS = [
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00',
  '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00'
];
// Pricing config
const PRICE_PER_SEAT = 5;      // change as needed
const DEPOSIT_PERCENT = 0.2;   // 20% deposit
  

function todayISO() {
  const d = new Date();
  const tzOffset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - tzOffset * 60000);
  return local.toISOString().slice(0, 10);
}

const STORAGE_KEY = 'reservations:v1';
const UI_STATE_KEY = 'reservation_ui:v1';

export default function ReservationSystem({ adminMode = false }) {
  const [reservations, setReservations] = useState([]);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [capacity, setCapacity] = useState(RESTAURANT_CAPACITY);
  const [sending, setSending] = useState(false);
  const [pendingPayment, setPendingPayment] = useState(null); // { id, deposit, total }
  const [payingId, setPayingId] = useState(null); // NEW
  const payBoxRef = useRef(null);
  const [activeRes, setActiveRes] = useState(null);

useEffect(() => {
  if (pendingPayment && payBoxRef.current) {
    payBoxRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}, [pendingPayment]);

  useEffect(() => {
    if (pendingPayment) {
      console.log('Rendering PayPal deposit for', pendingPayment);
    }
  }, [pendingPayment]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setReservations(JSON.parse(raw));
    } catch (e) {
      console.warn('Failed to parse reservations from storage', e);
    }
    try {
      const uiRaw = localStorage.getItem(UI_STATE_KEY);
      if (uiRaw) {
        const ui = JSON.parse(uiRaw);
        if (ui && typeof ui === 'object') {
          if (typeof ui.selectedDate === 'string' && /\d{4}-\d{2}-\d{2}/.test(ui.selectedDate)) {
            setSelectedDate(ui.selectedDate);
          }
          const capNum = Number(ui.capacity);
          if (Number.isFinite(capNum) && capNum >= 1) {
            setCapacity(capNum);
          }
        }
      }
    } catch (e) {
      console.warn('Failed to parse UI state from storage', e);
    }
  }, []);

  // Persist to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(reservations));
    } catch (e) {
      console.warn('Failed to save reservations to storage', e);
    }
    try {
      localStorage.setItem(UI_STATE_KEY, JSON.stringify({ selectedDate, capacity }));
    } catch (e) {
      console.warn('Failed to save UI state', e);
    }
  }, [reservations, selectedDate, capacity]);

  // Compute usage per slot for selected date (exclude cancelled)
  const usageByTime = useMemo(() => {
    const map = new Map();
    for (const t of TIME_SLOTS) map.set(t, 0);
    for (const r of reservations) {
      if (r.date === selectedDate && r.status !== 'cancelled') {
        map.set(r.time, (map.get(r.time) || 0) + Number(r.partySize || 0));
      }
    }
    return map;
  }, [reservations, selectedDate]);

  function canFit(date, time, partySize) {
    const used = reservations
      .filter(r => r.date === date && r.time === time && r.status !== 'cancelled')
      .reduce((sum, r) => sum + Number(r.partySize || 0), 0);
    return used + Number(partySize) <= capacity;
  }

  // Fire-and-forget notification (does not block UI)
  function notifyReservationCreated(res) {
    const toEmail = process.env.REACT_APP_NOTIFICATION_TO;
    if (!toEmail) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('REACT_APP_NOTIFICATION_TO not set; skipping email notification');
      }
      return;
    }
    const subject = `New reservation: ${res.name} • ${res.date} ${res.time}`;
    const html = `
      <h2>New Reservation</h2>
      <p><strong>Name:</strong> ${res.name}</p>
      <p><strong>Phone:</strong> ${res.phone}</p>
      <p><strong>Party:</strong> ${res.partySize}</p>
      <p><strong>Date & Time:</strong> ${res.date} ${res.time}</p>
      ${res.notes ? `<p><strong>Notes:</strong> ${res.notes}</p>` : ''}
    `;
    // Intentionally not awaited
    sendNotification({ toEmail, subject, html, text: undefined }).catch(err => {
      console.error('Failed to send reservation notification', err);
    });
  }

  // Notify admin when a deposit has been successfully captured
  async function notifyDepositPaid(reservation, details, depositAmt, totalAmt) {
    const toEmail = process.env.REACT_APP_NOTIFICATION_TO;
    if (!toEmail) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('REACT_APP_NOTIFICATION_TO not set; skipping deposit notification');
      }
      return;
    }
  
    const captureId =
      details?.id ||
      details?.purchase_units?.[0]?.payments?.captures?.[0]?.id;
  
    const payerName = details?.payer?.name
      ? `${details.payer.name.given_name || ''} ${details.payer.name.surname || ''}`.trim()
      : '';
  
    const subject = `Deposit paid • ${reservation?.name} • ${reservation?.date} ${reservation?.time}`;
    const html = `
      <h2>Deposit Paid</h2>
      <p><strong>Name:</strong> ${reservation?.name}</p>
      <p><strong>Party:</strong> ${reservation?.partySize}</p>
      <p><strong>Date & Time:</strong> ${reservation?.date} ${reservation?.time}</p>
      <p><strong>Deposit:</strong> $${Number(depositAmt || 0).toFixed(2)} (of total $${Number(totalAmt || 0).toFixed(2)})</p>
      <p><strong>PayPal Capture ID:</strong> ${captureId || 'n/a'}</p>
      ${payerName ? `<p><strong>Payer:</strong> ${payerName}</p>` : ''}
    `;
  
    try {
      await sendNotification({ toEmail, subject, html, text: undefined });
    } catch (e) {
      console.error('Failed to send deposit notification', e);
    }
  }

  function handleAddReservation(data) {
    const { name, phone, partySize, date, time, notes } = data;
    if (!canFit(date, time, partySize)) {
      alert('Sorry, this time slot is at capacity for the selected party size.');
      return false;
    }
    const newRes = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim(),
      phone: phone.trim(),
      partySize: Number(partySize),
      date,
      time,
      notes: (notes || '').trim(),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    // After newRes is created and added to state:
    const seats = Number(newRes.partySize || 1);
    const total = seats * PRICE_PER_SEAT;
    const deposit = Math.max(1, Math.round(total * DEPOSIT_PERCENT * 100) / 100); // min $1, 2 decimals
    setPendingPayment({ id: newRes.id, total, deposit });
    setActiveRes(newRes);
    setPayingId(newRes.id);
    setReservations(prev => [newRes, ...prev]);
    try { notifyReservationCreated(newRes); } catch {}
    return true;
  }

  // User action: request cancel
  function handleRequestCancel(id) {
    setReservations(prev => prev.map(r => (r.id === id ? { ...r, status: 'cancel_requested' } : r)));
  }

  // Admin actions
  function handleConfirm(id) {
    setReservations(prev => prev.map(r => (r.id === id ? { ...r, status: 'confirmed' } : r)));
  }
  function handleApproveCancel(id) {
    setReservations(prev => prev.map(r => (r.id === id ? { ...r, status: 'cancelled' } : r)));
  }

  function handlePayDeposit(reservation) {
    const seats = Number(reservation.partySize || 1);
    const total = reservation.totalAmount ?? seats * PRICE_PER_SEAT;
    const deposit = reservation.depositAmount ?? Math.max(1, Math.round(total * DEPOSIT_PERCENT * 100) / 100);
    setPendingPayment({ id: reservation.id, total, deposit });
    setPayingId(reservation.id);
    setActiveRes(reservation);
  }

  async function handleSendTestNotification() {
    try {
      setSending(true);
      const result = await sendNotification({
        toEmail: 'rhonamaebanawan.capadiso@my.smciligan.edu.ph',
        subject: 'TableTime Test Email',
        html: '<strong>Hello from TableTime!</strong><br/>Your email integration works.',
        text: 'Hello from TableTime! Your email integration works.'
      });
      alert('Notification sent: ' + (result?.status || 'ok'));
    } catch (e) {
      console.error(e);
      alert('Failed to send notification. Check console and env vars.');
    } finally {
      setSending(false);
    }
  }

  const reservationsForDay = useMemo(() => {
    return reservations
      .filter(r => r.date === selectedDate)
      .sort((a, b) => (a.time.localeCompare(b.time)) || (b.createdAt.localeCompare(a.createdAt)));
  }, [reservations, selectedDate]);
  

  return (
    <div className="reservation-system">
      <h1>Restaurant Reservation System</h1>

      <div className="controls">
        <div className="control">
          <label htmlFor="date">Date</label>
          <input
            id="date"
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
          />
        </div>
        <div className="control">
          <label htmlFor="capacity">Capacity (seats per slot)</label>
          <input
            id="capacity"
            type="number"
            min={1}
            value={capacity}
            onChange={e => setCapacity(Math.max(1, Number(e.target.value || 0)))}
          />
        </div>
        {adminMode && (
          <div className="control" style={{ alignSelf: 'end' }}>
            <button className="btn btn-primary" type="button" onClick={handleSendTestNotification} disabled={sending}>
              {sending ? 'Sending…' : 'Send test email'}
            </button>
          </div>
        )}
      </div>

      <ReservationForm
        date={selectedDate}
        timeSlots={TIME_SLOTS}
        capacity={capacity}
        usageByTime={usageByTime}
        onSubmit={handleAddReservation}
      />

      <ReservationList
        reservations={reservationsForDay}
        timeSlots={TIME_SLOTS}
        capacity={capacity}
        usageByTime={usageByTime}
        onConfirm={adminMode ? handleConfirm : undefined}
        onApproveCancel={adminMode ? handleApproveCancel : undefined}
        onCancel={adminMode ? handleRequestCancel : handleRequestCancel}
        onPayDeposit={handlePayDeposit}
        payingId={payingId}                // NEW
      />

    {pendingPayment && console.log('Rendering PayPal deposit for', pendingPayment)}
    {pendingPayment && (
  <div ref={payBoxRef} className="paybox">
    <h3>Pay Reservation Deposit</h3>
    <div className="paybox-info">
      Total: ${pendingPayment.total.toFixed(2)} • Deposit (20%): <strong>${pendingPayment.deposit.toFixed(2)}</strong>
    </div>
    <DepositPanel
  open={!!pendingPayment}
  reservation={activeRes}
  deposit={pendingPayment?.deposit}
  total={pendingPayment?.total}
  onClose={() => { setPendingPayment(null); setActiveRes(null); setPayingId(null); }}
  onSuccess={(details) => {
    setReservations(prev => prev.map(r =>
      r.id === pendingPayment.id
        ? { ...r, status: 'confirmed', depositPaid: true, depositAmount: pendingPayment.deposit, totalAmount: pendingPayment.total, paymentId: details?.id }
        : r
    ));
    try { notifyDepositPaid(activeRes, details, pendingPayment.deposit, pendingPayment.total); } catch {}
    setPendingPayment(null);
    setActiveRes(null);
    setPayingId(null);
  }}
/>
  </div>
)}
    </div>
  );
}
