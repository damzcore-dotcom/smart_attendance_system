import React from 'react';

const DemoBanner = ({ expiry, contact = '082124130065' }) => {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 99999,
      background: 'linear-gradient(90deg, #f59e0b, #d97706)',
      color: '#fff',
      textAlign: 'center',
      padding: '7px 16px',
      fontSize: '13px',
      fontWeight: 600,
      letterSpacing: '0.3px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '16px',
      flexWrap: 'wrap'
    }}>
      <span>🔶 DEMO MODE — Versi demonstrasi, data bersifat sample</span>
      {expiry && (
        <span>│ Berlaku hingga: {new Date(expiry).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
      )}
      <span>│ 📞 Hubungi: {contact}</span>
    </div>
  );
};

export default DemoBanner;
