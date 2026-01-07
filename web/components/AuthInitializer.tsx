'use client';

import { useEffect, useState } from 'react';
import { useUserStore } from '@/store';
import api from '@/lib/api';

export default function AuthInitializer({ children }: { children: React.ReactNode }) {
  const [initialized, setInitialized] = useState(false);
  const setUser = useUserStore((s) => s.setUser);
  const setBalances = useUserStore((s) => s.setBalances);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const { data } = await api.get('/account/balances');
          setUser({ id: 'restored', email: '' }, token);
          setBalances(data);
        } catch {
          localStorage.removeItem('token');
        }
      }
      setInitialized(true);
    };
    initAuth();
  }, [setUser, setBalances]);

  if (!initialized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-text-secondary">Loading...</div>
      </div>
    );
  }

  return <>{children}</>;
}
