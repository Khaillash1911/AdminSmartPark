import { Injectable } from '@angular/core';
import { Firestore, collection, onSnapshot, query, orderBy, doc, updateDoc, where, getDocs, setDoc } from '@angular/fire/firestore';
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
  source?: string;
  image_source?: string;
  reason?: string;
  overlap_ratio?: number;
  uid?: string;
  name?: string;
  email?: string;
  student_id?: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationAdminService {
  constructor(private firestore: Firestore) {}

  listenToAllViolations(): Observable<AdminNotification[]> {
    return new Observable(observer => {
      const q = query(collection(this.firestore, 'violations'), orderBy('timestamp', 'desc'));
      const unsub = onSnapshot(q, snap => {
        observer.next(
          snap.docs
            .map(d => ({ id: d.id, ...d.data() } as AdminNotification))
            .filter(item => item.type === 'double_park' || item.type === 'oku_violation')
        );
      }, err => observer.error(err));
      return () => unsub();
    });
  }

  async markResolved(id: string): Promise<void> {
    const update = { resolved: true, is_read: true, status: 'resolved' };
    await Promise.all([
      setDoc(doc(this.firestore, `violations/${id}`), update, { merge: true }),
      setDoc(doc(this.firestore, `notifications/${id}`), update, { merge: true })
    ]);
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
