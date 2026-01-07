'use client';

import dynamic from 'next/dynamic';
import Header from '@/components/Header';
import Orderbook from '@/components/Orderbook';
import TradeHistory from '@/components/TradeHistory';
import OrderForm from '@/components/OrderForm';
import OpenOrders from '@/components/OpenOrders';
import Balances from '@/components/Balances';
import { useWebSocket } from '@/hooks/useWebSocket';

const Chart = dynamic(() => import('@/components/Chart'), { ssr: false });

export default function TradePage({ params }: { params: { symbol: string } }) {
  const symbol = params.symbol.replace('-', '/');
  
  useWebSocket(symbol);

  return (
    <div className="min-h-screen bg-background text-text-primary flex flex-col">
      <Header />
      
      <main className="flex-1 p-1 gap-1 grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 grid-rows-[auto_1fr] h-[calc(100vh-3.5rem)] overflow-hidden">
        <div className="md:col-span-3 lg:col-span-3 xl:col-span-4 flex flex-col gap-1 overflow-hidden">
          <div className="flex-1 bg-surface border border-border rounded-sm relative min-h-[400px]">
            <div className="absolute inset-0 p-2">
              <div className="h-full w-full">
                <Chart />
              </div>
            </div>
          </div>
          <div className="h-64">
            <OpenOrders />
          </div>
        </div>

        <div className="md:col-span-1 lg:col-span-1 xl:col-span-1 flex flex-col gap-1 overflow-hidden">
          <div className="h-3/5">
            <Orderbook />
          </div>
          <div className="h-2/5">
            <TradeHistory />
          </div>
        </div>

        <div className="md:col-span-1 lg:col-span-1 xl:col-span-1 flex flex-col gap-1 overflow-hidden">
          <OrderForm />
          <div className="flex-1 overflow-auto">
            <Balances />
          </div>
        </div>
      </main>
    </div>
  );
}
