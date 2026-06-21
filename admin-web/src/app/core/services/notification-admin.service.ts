import { Injectable } from '@angular/core';
import { Firestore, collection, onSnapshot, query, orderBy, doc, updateDoc, where, getDocs } from '@angular/fire/firestore';
import { Observable } from 'rxjs';

export interface AdminNotification {
  id: string;
  car_plate: string;
  type: 'double_park' | 'oku_violation';
  message: string;
  spot_id?: string;
  timestamp: any;
  is_read: boolean;
  resolved: boolean;
}

@Injectable({ providedIn: 'root' })
export class NotificationAdminService {
  constructor(private firestore: Firestore) {}

  listenToAllViolations(): Observable<AdminNotification[]> {
    return new Observable(observer => {
      const q = query(collection(this.firestore, 'notifications'), orderBy('timestamp', 'desc'));
      const unsub = onSnapshot(q, snap => {
        observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() } as AdminNotification)));
      }, err => observer.error(err));
      return () => unsub();
    });
  }

  async markResolved(id: string): Promise<void> {
    await updateDoc(doc(this.firestore, `notifications/${id}`), { resolved: true, is_read: true });
  }

  getUnresolvedCount(): Observable<number> {
    return new Observable(observer => {
      const q = query(collection(this.firestore, 'notifications'), where('resolved', '==', false));
      const unsub = onSnapshot(q, snap => {
        observer.next(snap.size);
      }, err => observer.error(err));
      return () => unsub();
    });
  }
}
