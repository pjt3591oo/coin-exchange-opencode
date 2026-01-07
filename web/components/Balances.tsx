'use client';

import { useAuth } from '@/hooks/useAuth';

export default function Balances() {
  const { user, balances } = useAuth();

  if (!user) return null;

  return (
    <div className="bg-surface border border-border rounded-sm p-4 h-full">
      <h3 className="text-sm font-semibold text-text-primary mb-4">Assets</h3>
      <div className="space-y-3">
        {Object.entries(balances).map(([asset, balance]) => (
          <div key={asset} className="flex justify-between items-center text-sm">
            <span className="text-text-secondary font-medium">{asset}</span>
            <div className="text-right">
              <div className="text-text-primary">{balance.available.toFixed(4)}</div>
              <div className="text-xs text-text-secondary">Locked: {balance.locked.toFixed(4)}</div>
            </div>
          </div>
        ))}
        {Object.keys(balances).length === 0 && (
          <div className="text-center text-text-secondary text-sm py-4">
            No assets found
          </div>
        )}
      </div>
    </div>
  );
}
