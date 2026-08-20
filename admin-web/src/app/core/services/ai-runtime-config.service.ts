import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { firstValueFrom, timeout } from 'rxjs';

export type AiServiceStatus = 'online' | 'degraded' | 'offline';

interface AiRuntimeDocument {
  baseUrl?: string;
  status?: AiServiceStatus;
}

interface AiHealth {
  status: AiServiceStatus;
  yolo: 'ready' | 'offline';
  ocr: 'ready' | 'offline';
}

@Injectable({ providedIn: 'root' })
export class AiRuntimeConfigService {
  readonly status = signal<AiServiceStatus>('offline');
  readonly health = signal<AiHealth | null>(null);
  private baseUrl = '';

  constructor(private firestore: Firestore, private http: HttpClient) {}

  async initialize(): Promise<AiServiceStatus> {
    this.status.set('offline');
    this.health.set(null);
    try {
      const snapshot = await getDoc(doc(this.firestore, 'system_config/ai_api'));
      const value = snapshot.data() as AiRuntimeDocument | undefined;
      const baseUrl = this.validateBaseUrl(value?.baseUrl || '');
      if (!snapshot.exists() || value?.status === 'offline' || !baseUrl) return 'offline';

      const health = await firstValueFrom(
        this.http.get<AiHealth>(`${baseUrl}/health`).pipe(timeout(8000))
      );
      this.baseUrl = baseUrl;
      this.health.set(health);
      this.status.set(health.status);
      return health.status;
    } catch {
      this.baseUrl = '';
      this.status.set('offline');
      return 'offline';
    }
  }

  detectorUrl(path: string): string {
    return `${this.requireBaseUrl()}/detector-api/${path.replace(/^\//, '')}`;
  }

  anprUrl(path = ''): string {
    const suffix = path ? `/${path.replace(/^\//, '')}` : '';
    return `${this.requireBaseUrl()}/anpr-api${suffix}`;
  }

  clear(): void {
    this.baseUrl = '';
    this.health.set(null);
    this.status.set('offline');
  }

  private requireBaseUrl(): string {
    if (!this.baseUrl) {
      throw new Error('AI detection service is currently offline. Start the local AI services and try again.');
    }
    return this.baseUrl;
  }

  private validateBaseUrl(value: string): string {
    try {
      const url = new URL(value);
      const local = ['localhost', '127.0.0.1'].includes(url.hostname);
      const quickTunnel = url.protocol === 'https:' && url.hostname.endsWith('.trycloudflare.com');
      if (!quickTunnel && !(local && url.protocol === 'http:')) return '';
      return url.origin;
    } catch {
      return '';
    }
  }
}
