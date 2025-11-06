import React from 'react';

export default function ReservationList({
  reservations,
  onCancel,
  onConfirm,
  onApproveCancel,
  timeSlots,
  capacity,
  usageByTime,
  onPayDeposit,
  payingId,
  userReviews = [] // add default to avoid undefined on user page
}) {
  const grouped = timeSlots.map(t => ({
    time: t,
    items: reservations.filter(r => r.time === t),
  }));

  function StatusBadge({ status }) {
    const label = (status || 'pending').replace('_', ' ');
    return <span className={`badge badge--${status || 'pending'}`}>{label}</span>;
  }

  return (
    <div className="reservation-list">
      <h2>Reservations</h2>
      {grouped.map(group => {
        const used = usageByTime?.get?.(group.time) ?? 0;
        const remaining = Math.max(0, capacity - Number(used));
        return (
          <div className="slot" key={group.time}>
            <div className="slot-header">
              <div className="slot-time">{group.time}</div>
              <div className="slot-capacity">Used {used}/{capacity} • Remaining {remaining}</div>
            </div>
            {group.items.length === 0 ? (
              <div className="empty">No reservations</div>
            ) : (
              <ul className="items">
                {group.items.map(r => (
                  <li key={r.id} className="item">
                    <div className="summary">
                      <strong>{r.name}</strong> • Party {r.partySize} • {r.phone}
                      {' '}
                      <StatusBadge status={r.status} />
                    </div>
                    {r.notes ? <div className="notes">{r.notes}</div> : null}
                    <div className="actions" style={{ display: 'flex', gap: '.5rem' }}>
                    {onPayDeposit && !r.depositPaid && (
                      payingId === r.id ? (
                        // Inline PayPal button (uses the global pendingPayment in ReservationSystem)
                        <span>Open the deposit panel above to complete payment.</span>
                      ) : (
                        <button type="button" className="btn btn-primary" onClick={() => onPayDeposit(r)}>
                          Pay deposit
                        </button>
                      )
                    )}

                    {typeof r.totalAmount === 'number' && (
                      <span style={{ color: 'var(--text-700)' }}>
                        Remaining: ${ (r.totalAmount - (r.depositAmount || 0)).toFixed(2) }
                      </span>
                    )}
                    {r.depositPaid && <span className="badge" style={{ marginLeft: '.25rem' }}>Deposit paid</span>}
                      {(r.status === 'pending') && (
                        <>
                          {onConfirm && (
                            <button className="btn btn-primary" onClick={() => onConfirm(r.id)}>Confirm</button>
                          )}
                          {onCancel && (
                            <button className="cancel" onClick={() => onCancel(r.id)}>Request cancel</button>
                          )}
                        </>
                      )}
                      {(r.status === 'confirmed') && (
                        <>
                          {onCancel && (
                            <button className="cancel" onClick={() => onCancel(r.id)}>Request cancel</button>
                          )}
                        </>
                      )}
                      {(r.status === 'cancel_requested') && (
                        <>
                          {onApproveCancel && (
                            <button className="btn btn-secondary" onClick={() => onApproveCancel(r.id)}>Approve cancel</button>
                          )}
                        </>
                      )}
                      {/* cancelled: no actions */}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          
        );
      })}
    </div>
  );
}
