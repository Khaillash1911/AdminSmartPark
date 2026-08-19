import { Injectable } from '@angular/core';
import { Firestore, collection, getDocs, doc, updateDoc, onSnapshot } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface AppUser {
  uid: string;
  name: string;
  email: string;
  student_id: string;
  car_plate: string;
  car_model: string;
  car_colour: string;
  is_oku: boolean;
  is_flagged?: boolean;
  created_at?: any;
}

@Injectable({ providedIn: 'root' })
export class UserManagementService {
  constructor(private firestore: Firestore) {}

  async getAllUsers(): Promise<AppUser[]> {
    const snap = await getDocs(collection(this.firestore, 'users'));
    return snap.docs
      .map(d => ({ uid: d.id, ...d.data() } as AppUser))
      .sort((a, b) => this.createdAtMillis(b.created_at) - this.createdAtMillis(a.created_at));
  }

  listenToUsers(): Observable<AppUser[]> {
    return new Observable(observer => {
      const unsubscribe = onSnapshot(
        collection(this.firestore, 'users'),
        snapshot => {
          const users = snapshot.docs
            .map(document => ({ uid: document.id, ...document.data() } as AppUser))
            .sort((a, b) => this.createdAtMillis(b.created_at) - this.createdAtMillis(a.created_at));
          observer.next(users);
        },
        error => observer.error(error)
      );
      return () => unsubscribe();
    });
  }

  private createdAtMillis(value: any): number {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    if (typeof value.seconds === 'number') return value.seconds * 1000;
    if (value instanceof Date) return value.getTime();
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  searchUsers(users: AppUser[], query: string): AppUser[] {
    const q = query.toLowerCase().trim();
    if (!q) return users;
    return users.filter(u =>
      u.name?.toLowerCase().includes(q) ||
      u.student_id?.toLowerCase().includes(q) ||
      u.car_plate?.toLowerCase().includes(q)
    );
  }

  async getUserParkingHistory(uid: string) {
    try {
      const snap = await getDocs(collection(this.firestore, 'parking_logs'));
      return snap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter((l: any) => l.user_id === uid)
        .sort((a: any, b: any) => (b.entry_time?.seconds || 0) - (a.entry_time?.seconds || 0));
    } catch { return []; }
  }

  async flagUser(uid: string, flagged: boolean): Promise<void> {
    await updateDoc(doc(this.firestore, `users/${uid}`), { is_flagged: flagged });
  }

  async exportUserPDF(user: AppUser, history: any[]): Promise<void> {
    const pdf = new jsPDF();
    pdf.setFontSize(18);
    pdf.setTextColor(26, 35, 126);
    pdf.text('SmartPark APU — User Report', 105, 20, { align: 'center' });
    pdf.setFontSize(10);
    pdf.setTextColor(100);
    pdf.text(`Generated: ${new Date().toLocaleString('en-MY')}`, 105, 28, { align: 'center' });

    pdf.setFontSize(12);
    pdf.setTextColor(0);
    pdf.text('User Profile', 14, 40);
    autoTable(pdf, {
      startY: 45,
      head: [['Field', 'Value']],
      body: [
        ['Full Name', user.name],
        ['Student ID', user.student_id],
        ['Email', user.email],
        ['Car Plate', user.car_plate],
        ['Car Model', user.car_model],
        ['Car Colour', user.car_colour],
        ['OKU Status', user.is_oku ? 'Yes' : 'No'],
      ],
      theme: 'striped',
      headStyles: { fillColor: [26, 35, 126] }
    });

    let y = (pdf as any).lastAutoTable.finalY + 10;
    pdf.text('Parking History', 14, y);
    if (history.length > 0) {
      autoTable(pdf, {
        startY: y + 5,
        head: [['Entry Time', 'Exit Time', 'Spot', 'Duration']],
        body: history.slice(0, 50).map(h => {
          const entry = h.entry_time?.toDate ? h.entry_time.toDate() : new Date(h.entry_time);
          const exit = h.exit_time?.toDate ? h.exit_time.toDate() : null;
          const dur = exit ? `${Math.round((exit.getTime() - entry.getTime()) / 60000)} min` : 'Ongoing';
          return [entry.toLocaleString('en-MY'), exit?.toLocaleString('en-MY') || '-', h.spot_id || '-', dur];
        }),
        theme: 'striped',
        headStyles: { fillColor: [26, 35, 126] }
      });
    }

    const date = new Date().toLocaleDateString('en-MY').replace(/\//g, '-');
    pdf.save(`SmartPark_User_${user.student_id}_${date}.pdf`);
  }
}
