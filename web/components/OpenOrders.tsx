'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';

interface Order {
  orderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET';
  price?: string;
  quantity: string;
  filledQty: string;
  remainingQty: string;
  status: 'NEW' | 'PARTIAL' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  createdAt: string;
}

export default function OpenOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      fetchOrders();
    }
  }, [isAuthenticated]);

  const fetchOrders = async () => {
    try {
      const { data } = await api.get('/orders');
      const openOrders = data.filter((o: Order) => o.status === 'NEW' || o.status === 'PARTIAL');
      setOrders(openOrders);
    } catch (error) {
      console.error('Failed to fetch orders', error);
    }
  };

  const cancelOrder = async (orderId: string) => {
    try {
      await api.delete(`/orders/${orderId}`);
      setOrders(orders.filter(o => o.orderId !== orderId));
    } catch (error) {
      console.error('Failed to cancel order', error);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <div className="flex flex-col h-full bg-surface border border-border rounded-sm">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-text-primary">Open Orders</h3>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-text-secondary bg-background/50 sticky top-0">
            <tr>
              <th className="px-4 py-2 font-medium">Time</th>
              <th className="px-4 py-2 font-medium">Symbol</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Side</th>
              <th className="px-4 py-2 font-medium">Price</th>
              <th className="px-4 py-2 font-medium">Amount</th>
              <th className="px-4 py-2 font-medium">Filled</th>
              <th className="px-4 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.orderId} className="border-b border-border/50 hover:bg-white/5">
                <td className="px-4 py-2 text-text-secondary">
                  {format(new Date(order.createdAt), 'MM-dd HH:mm:ss')}
                </td>
                <td className="px-4 py-2 text-text-primary">{order.symbol}</td>
                <td className="px-4 py-2 text-text-primary capitalize">{order.type.toLowerCase()}</td>
                <td className={`px-4 py-2 capitalize ${order.side === 'BUY' ? 'text-success' : 'text-danger'}`}>
                  {order.side.toLowerCase()}
                </td>
                <td className="px-4 py-2 text-text-primary">{order.price ?? '-'}</td>
                <td className="px-4 py-2 text-text-primary">{order.quantity}</td>
                <td className="px-4 py-2 text-text-primary">{order.filledQty}</td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => cancelOrder(order.orderId)}
                    className="text-primary hover:text-yellow-400 text-xs"
                  >
                    Cancel
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {orders.length === 0 && (
          <div className="flex items-center justify-center h-20 text-text-secondary text-sm">
            No open orders
          </div>
        )}
      </div>
    </div>
  );
}
