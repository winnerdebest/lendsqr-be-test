import { Response } from 'express';

export interface WalletRealtimeEvent {
  type: 'transfer_received' | 'transfer_sent' | 'wallet_funded';
  reference: string;
  amountFormatted: string;
  counterpartyName?: string;
  narration?: string;
  timestamp: string;
}

class RealtimeHub {
  private readonly clientsByUserId = new Map<string, Set<Response>>();

  public addClient(userId: string, res: Response): () => void {
    let set = this.clientsByUserId.get(userId);
    if (!set) {
      set = new Set<Response>();
      this.clientsByUserId.set(userId, set);
    }
    set.add(res);

    return () => {
      const current = this.clientsByUserId.get(userId);
      if (current) {
        current.delete(res);
        if (current.size === 0) {
          this.clientsByUserId.delete(userId);
        }
      }
    };
  }

  public notifyUser(userId: string, event: WalletRealtimeEvent): void {
    const clients = this.clientsByUserId.get(userId);
    if (!clients || clients.size === 0) {
      return;
    }

    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of clients) {
      try {
        res.write(payload);
      } catch {
        // ignore broken pipe
      }
    }
  }
}

export const realtimeHub = new RealtimeHub();
