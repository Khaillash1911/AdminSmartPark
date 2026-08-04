import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, timer } from 'rxjs';
import { catchError, shareReplay, switchMap } from 'rxjs/operators';

export type ParkingOccupancyStatus = 'LOW' | 'MEDIUM' | 'HIGH';
export type ParkingDataSource = 'SIMULATION' | 'LIVE_CAMERA';

export interface ParkingRow {
  row: string;
  section: string;
  capacity: number;
  occupied: number;
  available: number;
  occupancyPercentage: number;
  status: ParkingOccupancyStatus;
  predictions?: {
    '15Minutes'?: number;
    '30Minutes'?: number;
    '60Minutes'?: number;
  };
}

export interface ParkingSection {
  section: string;
  capacity: number;
  occupied: number;
  available: number;
  occupancyPercentage: number;
  rows: ParkingRow[];
}

export interface ParkingOccupancyResponse {
  timestamp: string;
  source: ParkingDataSource;
  totalCapacity: number;
  totalOccupied: number;
  totalAvailable: number;
  overallOccupancyPercentage: number;
  sections: ParkingSection[];
}

export interface ParkingHistoryRecord {
  timestamp: string;
  section: string;
  row: string;
  capacity: number;
  occupied: number;
  available: number;
  occupancyPercentage: number;
  entries: number;
  exits: number;
}

@Injectable({ providedIn: 'root' })
export class ParkingOccupancyService {
  private readonly baseUrl = '/api/parking';
  private readonly pollMs = 60000;

  readonly occupancy$: Observable<ParkingOccupancyResponse | null> = timer(0, this.pollMs).pipe(
    switchMap(() => this.getOccupancy()),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  constructor(private http: HttpClient) {}

  getOccupancy(): Observable<ParkingOccupancyResponse | null> {
    return this.http.get<ParkingOccupancyResponse>(`${this.baseUrl}/occupancy`).pipe(
      catchError((error) => {
        console.error('Parking occupancy API error:', error);
        return of(null);
      })
    );
  }

  forceUpdate(): Observable<{ success: boolean; message: string; data: ParkingOccupancyResponse }> {
    return this.http.post<{ success: boolean; message: string; data: ParkingOccupancyResponse }>(
      `${this.baseUrl}/simulation/update`,
      {}
    );
  }

  resetSimulation(): Observable<{ success: boolean; message: string; data: ParkingOccupancyResponse }> {
    return this.http.post<{ success: boolean; message: string; data: ParkingOccupancyResponse }>(
      `${this.baseUrl}/simulation/reset`,
      {}
    );
  }
}
