import { Injectable } from '@angular/core';
import { Firestore, doc, getDoc, updateDoc, setDoc } from '@angular/fire/firestore';

export interface PricingConfig {
  free_hours: number;
  hourly_rate: number;
  updated_at?: any;
  updated_by?: string;
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  constructor(private firestore: Firestore) {}

  async getPricingConfig(): Promise<PricingConfig> {
    const d = await getDoc(doc(this.firestore, 'settings/pricing'));
    if (d.exists()) {
      return d.data() as PricingConfig;
    }
    // Default fallback
    return { free_hours: 1, hourly_rate: 1.0 };
  }

  async updatePricingConfig(config: PricingConfig, adminId: string): Promise<void> {
    const data = {
      ...config,
      updated_at: new Date(),
      updated_by: adminId
    };
    await setDoc(doc(this.firestore, 'settings/pricing'), data, { merge: true });
  }
}
