import React, { useEffect, useState, useMemo } from 'react';
import './App.css';
import ReservationSystem from './components/ReservationSystem';
import Auth, { getSession, clearSession } from './components/Auth';
import ReservationList from './components/ReservationList';
import Reviews from './components/Reviews';
import { PayPalScriptProvider } from "@paypal/react-paypal-js";
import { sendNotification } from './utils/notification';

const paypalOptions = {
  "client-id": process.env.REACT_APP_PAYPAL_CLIENT_ID,
  currency: "USD", // or "PHP"
  intent: "capture",
  components: 'buttons',
};

// Admin constants/utilities (mirror of ReservationSystem)
const ADMIN_STORAGE_KEY = 'reservations:v1';
const ADMIN_TIME_SLOTS = [
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00',
  '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00'
];
const REVIEW_TARGET_URL = 'https://www.tripadvisor.com/Attraction_Review-g3657707-d6652740-Reviews-Jeti_Oguz_Canyon_Seven_Bulls_Rocks-Issyk_Kul_Province.html';

function todayISO() {
  const d = new Date();
  const tzOffset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - tzOffset * 60000);
  return local.toISOString().slice(0, 10);
}

function AdminView() {
  const [reservations, setReservations] = useState([]);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [capacity, setCapacity] = useState(40);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [userReviews, setUserReviews] = useState([]);
  const [fetchedReviews, setFetchedReviews] = useState([]);
  const [acceptingId, setAcceptingId] = useState(null);

  function load() {
    try {
      const raw = localStorage.getItem(ADMIN_STORAGE_KEY);
      setReservations(raw ? JSON.parse(raw) : []);
    } catch {
      setReservations([]);
    }
  }
  useEffect(() => { load(); }, []);

  function loadUserReviews() {
    try {
      const raw = localStorage.getItem('reviews:v1');
      const list = raw ? JSON.parse(raw) : [];
      // newest first
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setUserReviews(list);
    } catch {
      setUserReviews([]);
    }
  }
  useEffect(() => { loadUserReviews(); }, []);

  // Persist
  useEffect(() => {
    try { localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(reservations)); } catch {}
  }, [reservations]);

  // Compute usage excluding fully cancelled
  const usageByTime = useMemo(() => {
    const map = new Map();
    for (const t of ADMIN_TIME_SLOTS) map.set(t, 0);
    for (const r of reservations) {
      if (r.date === selectedDate && r.status !== 'cancelled') {
        map.set(r.time, (map.get(r.time) || 0) + Number(r.partySize || 0));
      }
    }
    return map;
  }, [reservations, selectedDate]);

  const reservationsForDay = useMemo(() => {
    return reservations
      .filter(r => r.date === selectedDate)
      .sort((a, b) => (a.time.localeCompare(b.time)) || (b.createdAt?.localeCompare?.(a.createdAt) || 0));
  }, [reservations, selectedDate]);

  // Admin actions
  function update(id, patch) {
    setReservations(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }
  function handleConfirm(id) { update(id, { status: 'confirmed' }); }
  function handleRequestCancel(id) { update(id, { status: 'cancel_requested' }); }
  function handleApproveCancel(id) { update(id, { status: 'cancelled' }); }

  // Minimal Review API integration (browser fetch equivalent of provided Node snippet)
  // inside AdminView()
  async function handleFetchReviews() {
    setLoadingReviews(true);
    try {
      const qs = new URLSearchParams({ url: REVIEW_TARGET_URL }).toString();
      const endpoint = process.env.REACT_APP_REVIEWAPI_ENDPOINT || 'https://app.reviewapi.io/api/v0/reviews';
      const key = process.env.REACT_APP_REVIEWAPI_KEY;
      const headers = key ? { Accept: 'application/json', 'x-api-key': key } : { Accept: 'application/json' };
      const res = await fetch(`${endpoint}?${qs}`, { method: 'GET', headers });
      const raw = await res.text();
      let data;
      try { data = JSON.parse(raw); } catch { data = raw; }
      if (!res.ok) {
        console.error('ReviewAPI non-OK:', res.status, data);
        alert(`ReviewAPI error ${res.status}`);
        return;
      }
      const list = Array.isArray(data?.reviews) ? data.reviews : [];
      setFetchedReviews(list);
    } catch (e) {
      console.error('ReviewAPI error:', e);
      alert('Failed to fetch reviews. Check console for details.');
    } finally {
      setLoadingReviews(false);
    }
  }


  async function handleAcceptExternalReview(item) {
    try {
      setAcceptingId(item.id || item.reviewId || item.url || JSON.stringify(item).slice(0, 50));
      const raw = localStorage.getItem('reviews:v1');
      const existing = raw ? JSON.parse(raw) : [];
      const mapped = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
        name: item.author || item.reviewer || item.user || 'Guest',
        rating: Number(item.rating || item.stars || 0),
        comment: item.text || item.comment || item.content || '',
        createdAt: item.date || new Date().toISOString(),
      };
      const next = [mapped, ...existing];
      localStorage.setItem('reviews:v1', JSON.stringify(next));
      setUserReviews(next.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
      const toEmail = process.env.REACT_APP_NOTIFICATION_TO;
      if (toEmail) {
        const subject = `External review accepted • ${mapped.name}`;
        const html = `
          <h2>External Review Accepted</h2>
          <p><strong>Name:</strong> ${mapped.name}</p>
          <p><strong>Rating:</strong> ${mapped.rating}</p>
          <p><strong>Comment:</strong> ${mapped.comment}</p>
          ${item.url ? `<p><strong>Source:</strong> <a href="${item.url}">${item.url}</a></p>` : ''}
        `;
        try { await sendNotification({ toEmail, subject, html, text: undefined }); } catch (e) { console.error(e); }
      }
      setFetchedReviews(prev => prev.filter(r => r !== item));
      alert('Review accepted');
    } catch (e) {
      console.error('Accept review failed', e);
      alert('Failed to accept review');
    } finally {
      setAcceptingId(null);
    }
  }

  return (
    <div>
      <h1>Admin • Reservation List</h1>
      <div className="controls">
        <div className="control">
          <label htmlFor="admin-date">Date</label>
          <input id="admin-date" type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
        </div>
        <div className="control">
          <label htmlFor="admin-capacity">Capacity (seats per slot)</label>
          <input id="admin-capacity" type="number" min={1} value={capacity} onChange={e => setCapacity(Math.max(1, Number(e.target.value || 0)))} />
        </div>
        <div className="control" style={{ alignSelf: 'end', display: 'flex', gap: '.5rem' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleFetchReviews}
            disabled={loadingReviews}
          >
            {loadingReviews ? 'Fetching…' : 'Fetch reviews'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={loadUserReviews}
          >
            Refresh user feedback
          </button>
        </div>
      </div>

      {fetchedReviews.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <h2>Fetched Reviews</h2>
          <ul className="review-list">
            {fetchedReviews.map((r, i) => (
              <li key={(r.id || r.reviewId || r.url || i) + '-f'} className="item">
                <div className="review-header">
                  <strong>{r.author || r.reviewer || 'Anonymous'}</strong>
                  <span className="stars small">
                    {Array.from({ length: 5 }).map((_, idx) => (
                      <span key={idx} className={idx < Number(r.rating || r.stars || 0) ? 'star filled' : 'star'}>★</span>
                    ))}
                  </span>
                </div>
                <div className="notes">{r.text || r.comment || r.content || ''}</div>
                <div style={{ color: 'var(--text-600)' }}>
                  {(r.date && new Date(r.date).toLocaleString()) || ''}
                </div>
                <div style={{ marginTop: '.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => handleAcceptExternalReview(r)}
                    disabled={acceptingId !== null}
                  >
                    {acceptingId !== null ? 'Processing…' : 'Accept'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ReservationList
        reservations={reservationsForDay}
        onCancel={handleRequestCancel}
        onConfirm={handleConfirm}
        onApproveCancel={handleApproveCancel}
        timeSlots={ADMIN_TIME_SLOTS}
        capacity={capacity}
        usageByTime={usageByTime}
        isAdmin={true}
        userReviews={userReviews}
      />
      <div style={{ marginTop: '1.25rem' }}>
      <h2>User Reviews & Feedback</h2>
      {userReviews.length === 0 ? (
        <div className="empty">No reviews yet</div>
      ) : (
        <ul className="review-list">
          {userReviews.map((r, i) => (
            <li key={r.id || i} className="item">
              <div className="review-header">
                <strong>{r.name || 'Anonymous'}</strong>
                <span className="stars small">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <span key={idx} className={idx < (r.rating || 0) ? 'star filled' : 'star'}>★</span>
                  ))}
                </span>
              </div>
              <div className="notes">{r.comment}</div>
              <div style={{ color: 'var(--text-600)' }}>
                {r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
    </div>
  );
}

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const isAdmin = currentUser?.role === 'admin';
  

  useEffect(() => {
    const sess = getSession();
    if (sess) setCurrentUser(sess);
  }, []);

  if (!currentUser) {
    return (
      <div className="App">
        <Auth onAuthed={setCurrentUser} />
      </div>
    );
  }

  function handleLogout() {
    clearSession();
    setCurrentUser(null);
  }

  return (
    <div className="App">
    <div className="topbar">
      <div className="welcome">Welcome, {currentUser.name}</div>
      <button className="logout" onClick={handleLogout}>Logout</button>
    </div>
    <PayPalScriptProvider options={paypalOptions}>
      <div className="App">
        {isAdmin ? (
          <AdminView />
        ) : (
          <>
            <ReservationSystem />
            <Reviews currentUser={currentUser} />
          </>
        )}
      </div>
    </PayPalScriptProvider>
    
  </div>
  );
}

export default App;
