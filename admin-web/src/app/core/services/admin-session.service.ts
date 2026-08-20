import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

interface SessionInitialization {
  status: 'initialized';
  simulationEnabled: boolean;
}

@Injectable({ providedIn: 'root' })
export class AdminSessionService {
  private simulationTimer?: ReturnType<typeof setInterval>;
  private initializePromise?: Promise<void>;

  constructor(private http: HttpClient) {}

  initialize(): Promise<void> {
    if (this.initializePromise) return this.initializePromise;
    this.initializePromise = this.initializeSession().catch(error => {
      this.initializePromise = undefined;
      throw error;
    });
    return this.initializePromise;
  }

  stop(): void {
    if (this.simulationTimer) clearInterval(this.simulationTimer);
    this.simulationTimer = undefined;
    this.initializePromise = undefined;
  }

  private async initializeSession(): Promise<void> {
    const session = await firstValueFrom(this.http.post<SessionInitialization>(
      `${environment.parkingApiUrl}/session/initialize`, {}
    ));
    if (!session.simulationEnabled || this.simulationTimer) return;

    await this.simulate();
    this.simulationTimer = setInterval(() => void this.simulate(), 60000);
  }

  private async simulate(): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${environment.parkingApiUrl}/simulate`, {}));
    } catch (error) {
      console.warn('Parking simulation cycle failed:', error);
    }
  }
}
