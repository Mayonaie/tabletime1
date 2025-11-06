import React, { useEffect, useMemo, useState } from 'react';

const REVIEWS_KEY = 'reviews:v1';

function readReviews() {
  try {
    const raw = localStorage.getItem(REVIEWS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function writeReviews(list) {
  localStorage.setItem(REVIEWS_KEY, JSON.stringify(list));
}

export default function Reviews({ currentUser }) {
  const [reviews, setReviews] = useState([]);
  const [name, setName] = useState('');
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [alert, setAlert] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Optional API endpoints (configure via .env)
  const REVIEWS_API = process.env.REACT_APP_REVIEWS_API; // e.g. http://localhost:4000/api/reviews
  const EXT_REVIEWS_ENDPOINT = process.env.REACT_APP_REVIEWAPI_ENDPOINT || 'https://app.reviewapi.io/api/v0/reviews';
  const EXT_REVIEW_KEY = process.env.REACT_APP_REVIEWAPI_KEY;
  const EXT_REVIEW_TARGET_URL = process.env.REACT_APP_REVIEW_TARGET_URL; // optional override

  useEffect(() => {
    // Prefer server reviews if configured; otherwise use local storage
    (async () => {
      setLoading(true);
      try {
        if (REVIEWS_API) {
          const res = await fetch(REVIEWS_API, { headers: { 'Accept': 'application/json' }, cache: 'no-store' });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) {
              setReviews(data);
              return;
            }
          }
        }
        setReviews(readReviews());
      } catch {
        setReviews(readReviews());
      } finally {
        setLoading(false);
      }
    })();
  }, [REVIEWS_API]);

  useEffect(() => {
    if (currentUser?.name) setName(currentUser.name);
  }, [currentUser]);

  const average = useMemo(() => {
    if (!reviews.length) return 0;
    const sum = reviews.reduce((s, r) => s + Number(r.rating || 0), 0);
    return Math.round((sum / reviews.length) * 10) / 10;
  }, [reviews]);

  function resetForm() {
    setRating(5);
    setComment('');
    if (!currentUser?.name) setName('');
  }

  function handleSubmit(e) {
    e.preventDefault();
    setAlert('');
    if (!name.trim()) return setAlert('Please enter your name');
    if (!comment.trim()) return setAlert('Please add a short comment');
    const item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      name: name.trim(),
      rating: Number(rating),
      comment: comment.trim(),
      createdAt: new Date().toISOString(),
    };
    const nextLocal = [item, ...reviews];
    // Try server first, fall back to local storage
    (async () => {
      setSaving(true);
      try {
        if (REVIEWS_API) {
          const res = await fetch(REVIEWS_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(item),
          });
          if (res.ok) {
            const serverItem = await res.json().catch(() => item);
            setReviews([serverItem || item, ...reviews]);
            resetForm();
            setSaving(false);
            return;
          }
        }
      } catch {}
      // fallback local
      setReviews(nextLocal);
      writeReviews(nextLocal);
      resetForm();
      setSaving(false);
    })();
  }

  async function handleFetchExternal() {
    try {
      setLoading(true);
      const target = EXT_REVIEW_TARGET_URL || 'https://www.tripadvisor.com/Attraction_Review-g3657707-d6652740-Reviews-Jeti_Oguz_Canyon_Seven_Bulls_Rocks-Issyk_Kul_Province.html';
      const qs = new URLSearchParams({ url: target }).toString();
      const headers = EXT_REVIEW_KEY ? { Accept: 'application/json', 'x-api-key': EXT_REVIEW_KEY } : { Accept: 'application/json' };
      const res = await fetch(`${EXT_REVIEWS_ENDPOINT}?${qs}`, { method: 'GET', headers });
      const raw = await res.text();
      let data;
      try { data = JSON.parse(raw); } catch { data = raw; }
      if (!res.ok) {
        setAlert(`Failed to fetch external reviews (${res.status}).`);
        return;
      }
      const list = Array.isArray(data?.reviews) ? data.reviews : [];
      const mapped = list.map((r) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
        name: r.author || r.reviewer || 'Anonymous',
        rating: Number(r.rating || r.stars || 0),
        comment: r.text || r.comment || r.content || '',
        createdAt: r.date || new Date().toISOString(),
        source: r.url || 'external'
      }));
      setReviews(prev => [...mapped, ...prev]);
    } catch (e) {
      setAlert('Could not fetch external reviews.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="reviews">
      <h2>Reviews & Feedback</h2>
      <div className="reviews-summary">
        <div className="stars" aria-label={`Average rating ${average} out of 5`}>
          {Array.from({ length: 5 }).map((_, i) => (
            <span key={i} className={i < Math.round(average) ? 'star filled' : 'star'}>★</span>
          ))}
        </div>
        <div className="meta">{average || '-'} / 5 • {reviews.length} review{reviews.length === 1 ? '' : 's'}</div>
      </div>

      <form className="review-form" onSubmit={handleSubmit}>
        {alert ? <div className="alert error">{alert}</div> : null}
        <div className="field" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="help-text">{loading ? 'Loading reviews…' : saving ? 'Saving…' : ''}</div>
          <button type="button" className="btn btn-secondary" onClick={handleFetchExternal}>
            Fetch external reviews
          </button>
        </div>
        <div className="field">
          <label htmlFor="rev-name">Name</label>
          <input id="rev-name" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
        </div>
        <div className="field">
          <label htmlFor="rev-rating">Rating</label>
          <select id="rev-rating" value={rating} onChange={e => setRating(e.target.value)}>
            {[5,4,3,2,1].map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="rev-comment">Comment</label>
          <textarea id="rev-comment" rows={3} value={comment} onChange={e => setComment(e.target.value)} placeholder="Share your experience..." />
        </div>
        <button className="btn btn-primary" type="submit">Submit review</button>
      </form>

      <ul className="review-list">
        {reviews.length === 0 ? (
          <li className="empty">No reviews yet</li>
        ) : (
          reviews.map(r => (
            <li key={r.id} className="item">
              <div className="review-header">
                <strong>{r.name}</strong>
                <span className="stars small">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span key={i} className={i < r.rating ? 'star filled' : 'star'}>★</span>
                  ))}
                </span>
              </div>
              <div className="notes">{r.comment}</div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
