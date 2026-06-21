import { Injectable } from '@angular/core';
import { Firestore, collection, getDocs, query, where, orderBy, Timestamp } from '@angular/fire/firestore';

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

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  constructor(private firestore: Firestore) {}

  async getLiveOverview() {
    const [spotsSnap, notifSnap] = await Promise.all([
      getDocs(collection(this.firestore, 'parking_spots')),
      getDocs(query(collection(this.firestore, 'notifications'), where('is_read', '==', false)))
    ]);

    const spots = spotsSnap.docs.map(d => ({ id: d.id, ...d.data() } as ParkingSpot));
    const occupied = spots.filter(s => s.status === 'occupied').length;
    const total = spots.length || 50;
    const okuTotal = spots.filter(s => s.is_oku).length || 5;
    const okuOccupied = spots.filter(s => s.is_oku && s.status === 'occupied').length;

    return {
      carsParked: occupied,
      spotsAvailable: total - occupied,
      okusAvailable: okuTotal - okuOccupied,
      activeViolations: notifSnap.size,
      totalSpots: total
    };
  }

  async getParkingLogs(period: 'today' | 'week' | 'month'): Promise<ParkingLog[]> {
    const now = new Date();
    let startDate: Date;
    if (period === 'today') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === 'week') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    try {
      const q = query(
        collection(this.firestore, 'parking_logs'),
        where('entry_time', '>=', Timestamp.fromDate(startDate)),
        orderBy('entry_time', 'asc')
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as ParkingLog));
    } catch {
      return [];
    }
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
