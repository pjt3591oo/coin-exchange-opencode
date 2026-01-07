'use client';

import Link from 'next/link';
import { useUserStore } from '@/store';
import { useAuth } from '@/hooks/useAuth';
import { LogOut, User } from 'lucide-react';

export default function Header() {
  const { user, isAuthenticated } = useUserStore();
  const { logout } = useAuth();

  return (
    <header className="h-14 bg-surface border-b border-border flex items-center justify-between px-4">
      <div className="flex items-center space-x-6">
        <Link href="/" className="text-primary font-bold text-xl tracking-tight">
          OPENCODE
        </Link>
        <nav className="hidden md:flex space-x-4 text-sm font-medium text-text-secondary">
          <Link href="/trade/BTC-USDT" className="hover:text-text-primary transition-colors">
            Trade
          </Link>
          <Link href="#" className="hover:text-text-primary transition-colors">
            Markets
          </Link>
        </nav>
      </div>

      <div className="flex items-center space-x-4">
        {isAuthenticated ? (
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm text-text-primary">
              <User size={16} />
              <span>{user?.email}</span>
            </div>
            <button
              onClick={logout}
              className="p-2 hover:bg-background rounded-full text-text-secondary hover:text-text-primary transition-colors"
            >
              <LogOut size={18} />
            </button>
          </div>
        ) : (
          <div className="flex items-center space-x-3 text-sm font-medium">
            <Link href="/login" className="text-text-primary hover:text-primary transition-colors">
              Log In
            </Link>
            <Link
              href="/register"
              className="bg-primary text-background px-4 py-1.5 rounded hover:bg-yellow-400 transition-colors"
            >
              Register
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
