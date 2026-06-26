import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface CarResult {
  uid: string;
  name: string;
  email: string;
  student_id: string;
  car_model: string;
  car_colour: string;
  car_plate: string;
  car_plate_search: string;
  is_oku: boolean;
  parking_level: string;
  parking_zone: string;
  parking_row: string;
  parking_slot: string;
  image_url: string;
  status: string;
  entry_time: string;
  exit_time: string | null;
}

export interface FindCarResponse {
  success: boolean;
  found: boolean;
  message: string;
  car?: CarResult;
  searched_plate?: string;
}

export interface SamplePlatesResponse {
  success: boolean;
  count: number;
  plates: Array<{
    car_plate: string;
    car_plate_search: string;
    car_model: string;
    car_colour: string;
  }>;
}

@Injectable({
  providedIn: 'root'
})
export class FindMyCarService {
  private baseUrl = 'http://127.0.0.1:5002';

  constructor(private http: HttpClient) {}

  findCarByPlate(plateNumber: string): Observable<FindCarResponse> {
    const cleanedPlate = plateNumber.replace(/\s+/g, '').toUpperCase();
    return this.http.get<FindCarResponse>(`${this.baseUrl}/find-car/${cleanedPlate}`);
  }

  getSamplePlates(): Observable<SamplePlatesResponse> {
    return this.http.get<SamplePlatesResponse>(`${this.baseUrl}/sample-plates`);
  }
}
