import { useState, useEffect } from 'react';
import { DefaultLogo } from './DefaultLogo';

export const AppLogo = ({ className = "w-full h-full" }) => {
  const [logoUrl, setLogoUrl] = useState(null);
  const [themeColor, setThemeColor] = useState(null);
  const [companyName, setCompanyName] = useState('');

  useEffect(() => {
    import('../services/api').then(({ settingsAPI }) => {
      settingsAPI.getPublicInfo().then(res => {
        if (res.success) {
          if (res.data.appLogo) setLogoUrl(res.data.appLogo);
          if (res.data.primaryColor) setThemeColor(res.data.primaryColor);
          if (res.data.companyName) setCompanyName(res.data.companyName);
        }
      }).catch(() => {});
    });
  }, []);

  if (logoUrl) {
    return <img src={logoUrl} alt="App Logo" className={`object-contain ${className}`} />;
  }

  return <DefaultLogo className={className} color={themeColor} name={companyName} />;
};
