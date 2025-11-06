import React, { useMemo, useState } from 'react';

export default function ReservationForm({ date, timeSlots, capacity, usageByTime, onSubmit }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [time, setTime] = useState(timeSlots[0] || '18:00');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const remainingSeats = useMemo(() => {
    const used = usageByTime?.get?.(time) ?? 0;
    return Math.max(0, capacity - Number(used));
  }, [usageByTime, time, capacity]);

  function validate() {
    if (!name.trim()) return 'Name is required';
    if (!/^[0-9+()\-\s]{7,}$/.test(phone.trim())) return 'Enter a valid phone number';
    if (!/.+@.+\..+/.test(email.trim())) return 'Enter a valid email address';
    const p = Number(partySize);
    if (!Number.isFinite(p) || p < 1) return 'Party size must be at least 1';
    if (!time) return 'Please select a time';
    if (!date) return 'Date is required';
    if (p > remainingSeats) return 'Not enough remaining seats for this slot';
    return '';
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    const ok = onSubmit({ name, phone, email, partySize, date, time, notes });
    if (ok) {
      setName('');
      setPhone('');
      setEmail('');
      setPartySize(2);
      setTime(timeSlots[0] || time);
      setNotes('');
      setSuccess('Reservation added');
    }
  }

  return (
    <form className="reservation-form" onSubmit={handleSubmit}>
      <h2>New Reservation</h2>

      {error ? <div className="alert error">{error}</div> : null}
      {success ? <div className="alert success">{success}</div> : null}

      <div className="summary" style={{
        padding: '0.75rem 1rem',
        background: 'var(--muted-100)',
        border: '1px solid var(--muted-200)',
        borderRadius: '10px',
        marginBottom: '1rem'
      }}>
        <strong>{date}</strong> • <span>{time}</span> • Remaining seats: <strong>{remainingSeats}</strong>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: '1rem'
      }}>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="Guest name" required aria-describedby="name-help" />
          <div id="name-help" className="help-text">Who should we book this under?</div>
        </div>

        <div className="field">
          <label htmlFor="phone">Phone</label>
          <input id="phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Contact number" inputMode="tel" pattern="[0-9+()\-\s]{7,}" required aria-describedby="phone-help" />
          <div id="phone-help" className="help-text">Include country code if applicable</div>
        </div>

        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="guest@example.com" required />
        </div>

        <div className="field">
          <label htmlFor="partySize">Party Size</label>
          <input
            id="partySize"
            type="number"
            min={1}
            max={20}
            value={partySize}
            onChange={e => setPartySize(Math.max(1, Number(e.target.value || 1)))}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="time">Time</label>
          <select id="time" value={time} onChange={e => setTime(e.target.value)} required>
            {timeSlots.map(t => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <div className="help-text">Remaining seats for {time}: {remainingSeats}</div>
        </div>

        <div className="field">
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Allergies, special requests..." rows={3} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '.75rem', marginTop: '0.5rem', alignItems: 'center' }}>
        <button type="submit">Add Reservation</button>
        <div className="help-text">You’ll be able to pay the small deposit after submitting</div>
      </div>
    </form>
  );
}
