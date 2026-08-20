import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AiRuntimeConfigService } from './ai-runtime-config.service';

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

export interface FindMyCarHealthResponse {
  message: string;
}

export interface PlateDetection {
  plate_number: string;
  raw_ocr_text: string;
  detection_confidence: number;
  ocr_confidence: number;
  plate_image_url: string;
}

export interface PlateDetectionResponse {
  success: boolean;
  message: string;
  plate_detected: boolean;
  confirmation_token: string;
  uploaded_image_url: string;
  result_image: string;
  best_detection: PlateDetection | null;
  detections: PlateDetection[];
  matched_user: RegisteredCarUser | null;
  parking_location: {
    parking_level: string;
    parking_zone: string;
    parking_row: string;
    parking_slot: string;
  };
}

export interface RegisteredCarUser {
  uid: string;
  name: string;
  email: string;
  student_id: string;
  car_plate: string;
  car_model: string;
  car_colour: string;
  is_oku: boolean;
}

export interface ConfirmCarDetails {
  uid: string;
  name: string;
  email: string;
  student_id: string;
  car_model: string;
  car_colour: string;
  is_oku: boolean;
  parking_level: string;
  parking_zone: string;
  parking_row: string;
  parking_slot: string;
  status: string;
  entry_time: string;
}

@Injectable({
  providedIn: 'root'
})
export class FindMyCarService {
  constructor(private http: HttpClient, private aiRuntime: AiRuntimeConfigService) {}

  checkApiStatus(): Observable<FindMyCarHealthResponse> {
    return this.http.get<FindMyCarHealthResponse>(this.aiRuntime.anprUrl());
  }

  findCarByPlate(plateNumber: string): Observable<FindCarResponse> {
    const cleanedPlate = plateNumber.replace(/\s+/g, '').toUpperCase();
    return this.http.get<FindCarResponse>(this.aiRuntime.anprUrl(`find-car/${cleanedPlate}`));
  }

  getSamplePlates(): Observable<SamplePlatesResponse> {
    return this.http.get<SamplePlatesResponse>(this.aiRuntime.anprUrl('sample-plates'));
  }

  detectPlate(file: File): Observable<PlateDetectionResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<PlateDetectionResponse>(this.aiRuntime.anprUrl('detect-plate'), formData);
  }

  confirmCar(confirmationToken: string, plateNumber: string, details: ConfirmCarDetails): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(this.aiRuntime.anprUrl('confirm-car'), {
      confirmation_token: confirmationToken,
      plate_number: plateNumber,
      ...details
    });
  }

  findRegisteredUser(plateNumber: string): Observable<{ success: boolean; found: boolean; user: RegisteredCarUser | null }> {
    const plate = plateNumber.replace(/[^a-z0-9]/gi, '').toUpperCase();
    return this.http.get<{ success: boolean; found: boolean; user: RegisteredCarUser | null }>(
      this.aiRuntime.anprUrl(`registered-user/${plate}`)
    );
  }
}
