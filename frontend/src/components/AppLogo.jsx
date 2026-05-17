import { useState, useEffect } from 'react';
import { IgaLogo } from './IgaLogo';

export const AppLogo = ({ className = "w-full h-full" }) => {
  const [logoUrl, setLogoUrl] = useState(null);

  useEffect(() => {
    import('../services/api').then(({ settingsAPI }) => {
      settingsAPI.getPublicInfo().then(res => {
        if (res.success && res.data.appLogo) {
          setLogoUrl(res.data.appLogo);
        }
      }).catch(() => {});
    });
  }, []);

  if (logoUrl) {
    return <img src={logoUrl} alt="App Logo" className={className} style={{ objectFit: 'contain' }} />;
  }

  return <IgaLogo className={className} />;
};
