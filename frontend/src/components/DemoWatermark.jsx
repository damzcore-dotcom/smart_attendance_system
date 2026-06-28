import React from 'react';

const DemoWatermark = () => {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      pointerEvents: 'none',
      zIndex: 99998,
      overflow: 'hidden'
    }}>
      <div style={{
        position: 'absolute',
        top: '-50%',
        left: '-50%',
        width: '200%',
        height: '200%',
        transform: 'rotate(-30deg)',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '100px'
      }}>
        {Array.from({ length: 40 }).map((_, i) => (
          <span key={i} style={{
            fontSize: '52px',
            fontWeight: 900,
            color: 'rgba(245, 158, 11, 0.055)',
            userSelect: 'none',
            whiteSpace: 'nowrap',
            fontFamily: 'Arial, sans-serif'
          }}>
            DEMO
          </span>
        ))}
      </div>
    </div>
  );
};

export default DemoWatermark;
