import { Injectable } from '@angular/core';
import { Firestore, collection, getDocs, query, where, orderBy, Timestamp } from '@angular/fire/firestore';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { AdminNotification } from './notification-admin.service';

export interface ParkingLog {
  id: string;
  car_plate: string;
  entry_time: any;
  exit_time: any;
  spot_id: string;
  is_oku_violation: boolean;
  is_double_park: boolean;
  user_id?: string;
}

export interface ParkingSpot {
  id: string;
  status: 'available' | 'occupied';
  is_oku: boolean;
  car_plate?: string;
}

export interface DailyTraffic {
  date: string;
  entries: number;
  exits: number;
}

export interface TrafficPrediction {
  predictionDate: string;
  predictedEntries: number;
  predictedExits: number;
  predictedNetFlow: number;
  demandLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  model: string;
  entryR2: number;
  exitR2: number;
  inputSource: 'LIVE' | 'LIVE_WITH_RESEARCH_BASELINE';
  liveDaysUsed: number;
  researchDaysUsed: number;
  currentDayProjected: boolean;
  currentDayEntries: number;
  currentDayExits: number;
  observedCurrentEntries: number;
  observedCurrentExits: number;
  asOf: string;
  hourlyProfile: Array<{
    hour: number;
    label: string;
    averageEntries: number;
    averageExits: number;
  }>;
}

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  constructor(private firestore: Firestore, private http: HttpClient) {}

  async getLiveOverview() {
    const [spotsSnap, violationsSnapshot] = await Promise.all([
      getDocs(collection(this.firestore, 'parking_spots')),
      getDocs(collection(this.firestore, 'violations'))
    ]);

    const spots = spotsSnap.docs.map(d => ({ id: d.id, ...d.data() } as ParkingSpot));
    const occupied = spots.filter(s => s.status === 'occupied').length;
    const total = spots.length;
    const okuTotal = spots.filter(s => s.is_oku).length;
    const okuOccupied = spots.filter(s => s.is_oku && s.status === 'occupied').length;
    const activeDoubleParking = violationsSnapshot.docs.filter(document => {
      const violation = document.data();
      return violation['type'] === 'double_park' && violation['resolved'] !== true;
    }).length;

    return {
      carsParked: occupied,
      spotsAvailable: total - occupied,
      okusAvailable: okuTotal - okuOccupied,
      activeViolations: activeDoubleParking,
      totalSpots: total
    };
  }

  async getParkingLogs(period: 'today' | 'week' | 'month'): Promise<ParkingLog[]> {
    const now = new Date();
    let startDate: Date;
    if (period === 'today') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === 'week') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const records: ParkingLog[] = [];
    try {
      const q = query(
        collection(this.firestore, 'parking_logs'),
        where('entry_time', '>=', Timestamp.fromDate(startDate)),
        orderBy('entry_time', 'asc')
      );
      const snap = await getDocs(q);
      records.push(...snap.docs.map(d => ({ id: d.id, ...d.data() } as ParkingLog)));
    } catch {}
    records.push(...await this.getFindMyCarRecords(startDate));
    return this.deduplicateAndSort(records);
  }

  async getRecentParkingLogs(days = 31): Promise<ParkingLog[]> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const records: ParkingLog[] = [];
    try {
      const logsQuery = query(
        collection(this.firestore, 'parking_logs'),
        where('entry_time', '>=', Timestamp.fromDate(startDate)),
        orderBy('entry_time', 'asc')
      );
      const snapshot = await getDocs(logsQuery);
      records.push(...snapshot.docs.map(document => ({ id: document.id, ...document.data() } as ParkingLog)));
    } catch {}
    records.push(...await this.getFindMyCarRecords(startDate));
    return this.deduplicateAndSort(records);
  }

  async getViolations(period: 'today' | 'week' | 'month'): Promise<AdminNotification[]> {
    const startDate = this.periodStart(period);
    try {
      const violationsQuery = query(
        collection(this.firestore, 'violations'),
        where('timestamp', '>=', Timestamp.fromDate(startDate)),
        orderBy('timestamp', 'asc')
      );
      const snapshot = await getDocs(violationsQuery);
      return snapshot.docs.map(document => ({ id: document.id, ...document.data() } as AdminNotification));
    } catch {
      try {
        const snapshot = await getDocs(collection(this.firestore, 'violations'));
        return snapshot.docs
          .map(document => ({ id: document.id, ...document.data() } as AdminNotification))
          .filter(item => {
            const timestamp = this.toDate(item.timestamp);
            return timestamp !== null && timestamp >= startDate;
          })
          .sort((a, b) => (this.toDate(a.timestamp)?.getTime() ?? 0) - (this.toDate(b.timestamp)?.getTime() ?? 0));
      } catch {
        return [];
      }
    }
  }

  private periodStart(period: 'today' | 'week' | 'month'): Date {
    const now = new Date();
    if (period === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === 'week') return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  private async getFindMyCarRecords(startDate: Date): Promise<ParkingLog[]> {
    try {
      const snapshot = await getDocs(collection(this.firestore, 'find_my_car'));
      return snapshot.docs
        .map(document => {
          const data = document.data();
          return {
            id: `find_my_car:${document.id}`,
            car_plate: data['car_plate'] ?? document.id,
            entry_time: data['entry_time'],
            exit_time: data['exit_time'] ?? null,
            spot_id: data['parking_slot'] ?? '',
            is_oku_violation: Boolean(data['is_oku_violation']),
            is_double_park: Boolean(data['is_double_park']),
            user_id: data['uid']
          } as ParkingLog;
        })
        .filter(record => {
          const entry = this.toDate(record.entry_time);
          return entry !== null && entry >= startDate;
        });
    } catch {
      return [];
    }
  }

  private deduplicateAndSort(records: ParkingLog[]): ParkingLog[] {
    const unique = new Map<string, ParkingLog>();
    for (const record of records) {
      const entry = this.toDate(record.entry_time);
      const key = `${record.car_plate}|${entry?.getTime() ?? record.id}`;
      unique.set(key, record);
    }
    return [...unique.values()].sort(
      (a, b) => (this.toDate(a.entry_time)?.getTime() ?? 0) - (this.toDate(b.entry_time)?.getTime() ?? 0)
    );
  }

  aggregateDailyTraffic(logs: ParkingLog[]): DailyTraffic[] {
    const totals = new Map<string, DailyTraffic>();
    for (const log of logs) {
      const entry = this.toDate(log.entry_time);
      if (!entry) continue;
      const key = this.localDateKey(entry);
      const row = totals.get(key) ?? { date: key, entries: 0, exits: 0 };
      row.entries++;
      totals.set(key, row);
      const exit = this.toDate(log.exit_time);
      if (exit) {
        const exitKey = this.localDateKey(exit);
        const exitRow = totals.get(exitKey) ?? { date: exitKey, entries: 0, exits: 0 };
        exitRow.exits++;
        totals.set(exitKey, exitRow);
      }
    }
    if (!totals.size) return [];

    const first = new Date(`${[...totals.keys()].sort()[0]}T00:00:00`);
    const today = new Date();
    const complete: DailyTraffic[] = [];
    for (const cursor = new Date(first); cursor <= today; cursor.setDate(cursor.getDate() + 1)) {
      const key = this.localDateKey(cursor);
      complete.push(totals.get(key) ?? { date: key, entries: 0, exits: 0 });
    }
    return complete.slice(-31);
  }

  getTrafficPrediction(dailyTraffic: DailyTraffic[]): Promise<TrafficPrediction> {
    return firstValueFrom(
      this.http.post<TrafficPrediction>('/api/parking/analytics/predict', { dailyTraffic })
    );
  }

  private toDate(value: any): Date | null {
    if (!value) return null;
    const parsed = value.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private localDateKey(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  getPeakHoursData(logs: ParkingLog[]): { labels: string[]; entries: number[]; exits: number[] } {
    const labels = Array.from({ length: 24 }, (_, i) => `${i}:00`);
    const entries = new Array(24).fill(0);
    const exits = new Array(24).fill(0);
    logs.forEach(log => {
      if (log.entry_time) {
        const h = log.entry_time.toDate ? log.entry_time.toDate().getHours() : new Date(log.entry_time).getHours();
        entries[h]++;
      }
      if (log.exit_time) {
        const h = log.exit_time.toDate ? log.exit_time.toDate().getHours() : new Date(log.exit_time).getHours();
        exits[h]++;
      }
    });
    return { labels, entries, exits };
  }

  getCarCountByDay(logs: ParkingLog[]): { labels: string[]; entries: number[]; exits: number[] } {
    const days: Record<string, { entries: number; exits: number }> = {};
    logs.forEach(log => {
      const d = log.entry_time?.toDate ? log.entry_time.toDate() : new Date(log.entry_time);
      const key = d.toLocaleDateString('en-MY', { weekday: 'short', day: '2-digit', month: 'short' });
      if (!days[key]) days[key] = { entries: 0, exits: 0 };
      days[key].entries++;
      if (log.exit_time) days[key].exits++;
    });
    const labels = Object.keys(days);
    return { labels, entries: labels.map(l => days[l].entries), exits: labels.map(l => days[l].exits) };
  }

  getOkuViolationsByDay(logs: ParkingLog[]): { labels: string[]; counts: number[] } {
    const days: Record<string, number> = {};
    logs.filter(l => l.is_oku_violation).forEach(log => {
      const d = log.entry_time?.toDate ? log.entry_time.toDate() : new Date(log.entry_time);
      const key = d.toLocaleDateString('en-MY', { day: '2-digit', month: 'short' });
      days[key] = (days[key] || 0) + 1;
    });
    const labels = Object.keys(days);
    return { labels, counts: labels.map(l => days[l]) };
  }

  getDoubleParkByDay(logs: ParkingLog[]): { labels: string[]; counts: number[] } {
    const days: Record<string, number> = {};
    logs.filter(l => l.is_double_park).forEach(log => {
      const d = log.entry_time?.toDate ? log.entry_time.toDate() : new Date(log.entry_time);
      const key = d.toLocaleDateString('en-MY', { day: '2-digit', month: 'short' });
      days[key] = (days[key] || 0) + 1;
    });
    const labels = Object.keys(days);
    return { labels, counts: labels.map(l => days[l]) };
  }
}
