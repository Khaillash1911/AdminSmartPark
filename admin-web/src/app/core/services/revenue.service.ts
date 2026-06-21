import { Injectable } from '@angular/core';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { ParkingLog } from './analytics.service';

export interface PricingConfig {
  free_hours: number;
  hourly_rate: number;
}

@Injectable({ providedIn: 'root' })
export class RevenueService {
  private defaultConfig: PricingConfig = { free_hours: 1, hourly_rate: 1.0 };

  constructor(private firestore: Firestore) {}

  async getPricingConfig(): Promise<PricingConfig> {
    try {
      const snap = await getDoc(doc(this.firestore, 'settings/config'));
      return snap.exists() ? (snap.data() as PricingConfig) : this.defaultConfig;
    } catch {
      return this.defaultConfig;
    }
  }

  calculateSessionRevenue(log: ParkingLog, config: PricingConfig): number {
    if (!log.exit_time || !log.entry_time) return 0;
    const entry = log.entry_time?.toDate ? log.entry_time.toDate() : new Date(log.entry_time);
    const exit = log.exit_time?.toDate ? log.exit_time.toDate() : new Date(log.exit_time);
    const hours = Math.max(0, (exit.getTime() - entry.getTime()) / 3600000);
    const billable = Math.max(0, hours - config.free_hours);
    return Number((billable * config.hourly_rate).toFixed(2));
  }

  async getRevenueStats(logs: ParkingLog[]): Promise<{
    dailyRevenue: number;
    weeklyByDay: { label: string; amount: number }[];
    monthlyByWeek: { label: string; amount: number }[];
    paidSessions: number;
    freeSessions: number;
  }> {
    const config = await this.getPricingConfig();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    let dailyRevenue = 0;
    let paidSessions = 0;
    let freeSessions = 0;
    const dayMap: Record<string, number> = {};
    const weekMap: Record<string, number> = {};

    logs.forEach(log => {
      const rev = this.calculateSessionRevenue(log, config);
      const entry = log.entry_time?.toDate ? log.entry_time.toDate() : new Date(log.entry_time);

      if (entry >= todayStart) dailyRevenue += rev;
      if (rev > 0) paidSessions++;
      else freeSessions++;

      if (entry >= weekStart) {
        const dayKey = entry.toLocaleDateString('en-MY', { weekday: 'short', day: '2-digit' });
        dayMap[dayKey] = (dayMap[dayKey] || 0) + rev;
      }

      const weekNum = Math.floor((now.getTime() - entry.getTime()) / (7 * 24 * 60 * 60 * 1000));
      if (weekNum < 4) {
        const wk = `Week ${4 - weekNum}`;
        weekMap[wk] = (weekMap[wk] || 0) + rev;
      }
    });

    return {
      dailyRevenue: Number(dailyRevenue.toFixed(2)),
      paidSessions,
      freeSessions,
      weeklyByDay: Object.entries(dayMap).map(([label, amount]) => ({ label, amount })),
      monthlyByWeek: Object.entries(weekMap).map(([label, amount]) => ({ label, amount }))
    };
  }
}
