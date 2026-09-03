import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { LegendEntry, LegendProposalResponse, UploadResponse } from './models';

@Service()
export class UploadService {
  private readonly http = inject(HttpClient);

  readLegend(file: File): Observable<LegendProposalResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<LegendProposalResponse>('/api/legend', formData);
  }

  upload(file: File, legend: LegendEntry[]): Observable<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('legend', JSON.stringify(legend));
    return this.http.post<UploadResponse>('/api/upload', formData);
  }
}
