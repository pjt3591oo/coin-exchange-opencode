export type BalanceEntryType = 
  | 'DEPOSIT' 
  | 'WITHDRAW' 
  | 'LOCK' 
  | 'UNLOCK' 
  | 'TRADE_CREDIT' 
  | 'TRADE_DEBIT' 
  | 'FEE';

export interface Balance {
  asset: string;
  available: string;
  locked: string;
}

export interface AccountBalance {
  id: string;
  userId: string;
  asset: string;
  available: string;
  locked: string;
  version: number;
  updatedAt: Date;
}

export interface BalanceEntry {
  id: string;
  userId: string;
  asset: string;
  amount: string;
  balanceAfter: string;
  entryType: BalanceEntryType;
  referenceType: string;
  referenceId: string;
  createdAt: Date;
}

export interface DepositRequest {
  asset: string;
  amount: string;
}

export interface WithdrawRequest {
  asset: string;
  amount: string;
}
