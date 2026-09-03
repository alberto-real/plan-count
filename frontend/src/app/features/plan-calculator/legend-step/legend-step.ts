import { Component, inject, output, signal } from '@angular/core';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { LegendEntry } from '../models';
import { UploadService } from '../upload.service';

type Status = 'idle' | 'reading' | 'error' | 'ready';

@Component({
  selector: 'app-legend-step',
  imports: [TranslocoModule],
  templateUrl: './legend-step.html',
})
export class LegendStep {
  private readonly uploadService = inject(UploadService);
  private readonly translocoService = inject(TranslocoService);

  readonly legendConfirmed = output<LegendEntry[]>();

  readonly status = signal<Status>('idle');
  readonly errorMessage = signal<string | null>(null);
  readonly entries = signal<LegendEntry[]>([]);

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    this.status.set('reading');
    this.errorMessage.set(null);

    this.uploadService.readLegend(file).subscribe({
      next: (response) => {
        this.entries.set(response.entries);
        this.status.set('ready');
      },
      error: (err: unknown) => {
        this.status.set('error');
        this.errorMessage.set(this.extractErrorMessage(err));
      },
    });
  }

  onKeyChange(index: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.entries.update((current) =>
      current.map((entry, i) => (i === index ? { ...entry, key: value } : entry)),
    );
  }

  onLabelChange(index: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.entries.update((current) =>
      current.map((entry, i) => (i === index ? { ...entry, label: value } : entry)),
    );
  }

  onConfirm(): void {
    this.legendConfirmed.emit(this.entries());
  }

  dismissError(): void {
    this.status.set('idle');
    this.errorMessage.set(null);
  }

  private extractErrorMessage(err: unknown): string {
    if (
      err &&
      typeof err === 'object' &&
      'error' in err &&
      err.error &&
      typeof err.error === 'object' &&
      'detail' in err.error &&
      typeof (err.error as { detail: unknown }).detail === 'string'
    ) {
      return (err.error as { detail: string }).detail;
    }
    return this.translocoService.translate('legendStep.genericError');
  }
}
