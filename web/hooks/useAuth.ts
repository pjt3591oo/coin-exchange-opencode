import { useUserStore } from '@/store';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';

export function useAuth() {
  const { user, setUser, logout, balances, isAuthenticated } = useUserStore();
  const router = useRouter();

  const login = async (email: string, password: string) => {
    try {
      const { data } = await api.post('/auth/login', { email, password });
      setUser(data.user, data.accessToken);
      router.push('/');
      return true;
    } catch (error) {
      console.error('Login failed', error);
      return false;
    }
  };

  const register = async (email: string, password: string) => {
    try {
      await api.post('/auth/register', { email, password });
      return true;
    } catch (error) {
      console.error('Registration failed', error);
      return false;
    }
  };

  const fetchBalances = async () => {
    try {
      const { data } = await api.get('/account/balances');
      useUserStore.getState().setBalances(data);
    } catch (error) {
      console.error('Failed to fetch balances', error);
    }
  };

  return { user, login, register, logout, fetchBalances, balances, isAuthenticated };
}
