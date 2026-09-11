import { InjectionToken, Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { macroErrorMessage } from '../http/macro-error';
import type { Envelope, Observation } from '../macro-contracts';
import { MACRO_DATA } from '../macro-data.provider';
import { WorkingQueryStore } from '../working-query.store';
import { toCsv } from './export-csv';
import { exportFilename } from './export-filename';
import { type ExportFormat, exportFormatSpec } from './export-format';
import { toJson } from './export-json';

/**
 * One request, and this many rows.
 *
 * CONSUMER-GUIDE section 6 steers bulk consumers to `pageSize=5000`, so this is
 * the service's own recommendation rather than a number chosen here. A result
 * larger than this is refused rather than truncated — see `too-large` below.
 */
export const EXPORT_PAGE_SIZE = 5000;

/** Shown when the request failed without the service explaining itself. */
const UNAVAILABLE = 'The export could not be downloaded.';

export interface ExportFile {
  readonly filename: string;
  readonly mimeType: string;
  readonly contents: string;
}

/**
 * Writing a file to disk, behind a token so specs never touch the DOM's
 * download path. Matches how `SAVED_QUERY_STORAGE` isolates localStorage.
 */
export const EXPORT_DOWNLOADER = new InjectionToken<(file: ExportFile) => void>(
  'EXPORT_DOWNLOADER',
  { providedIn: 'root', factory: () => anchorDownload }
);

/** The filename's date is nondeterministic, so it comes through a seam. */
export const EXPORT_CLOCK = new InjectionToken<() => string>('EXPORT_CLOCK', {
  providedIn: 'root',
  factory: () => () => new Date().toISOString()
});

/**
 * What a download attempt did.
 *
 * `too-large` is deliberately not an error. The request succeeded and the
 * answer was honest; it is this console that declines to write a file it would
 * have to truncate.
 */
export type ExportOutcome =
  | { readonly status: 'saved'; readonly rows: number }
  | { readonly status: 'invalid' }
  | { readonly status: 'too-large'; readonly totalCount: number; readonly limit: number }
  | { readonly status: 'unavailable'; readonly message: string };

/**
 * Builds and hands over the working query's whole result as a file.
 *
 * It re-fetches rather than writing the rows on screen. A result tab shows one
 * page of 25; an export that silently contained only those would be the worst
 * outcome available in a console whose subject is reproducible pulls.
 */
@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly macro = inject(MACRO_DATA);
  private readonly store = inject(WorkingQueryStore);
  private readonly downloader = inject(EXPORT_DOWNLOADER);
  private readonly now = inject(EXPORT_CLOCK);

  private readonly inFlight = signal(false);

  /** True for the whole round trip, so the button can report it. */
  readonly busy = this.inFlight.asReadonly();

  async download(format: ExportFormat, pinVintages: boolean): Promise<ExportOutcome> {
    // No request for an unsendable query, matching how the result tabs decline
    // to ask rather than collecting a documented 400.
    if (!this.store.validation().valid) {
      return { status: 'invalid' };
    }

    this.inFlight.set(true);

    try {
      const envelope = await this.fetchAll();
      const outcome = this.write(envelope, format, pinVintages);
      return outcome;
    } catch (error: unknown) {
      return { status: 'unavailable', message: macroErrorMessage(error, UNAVAILABLE) };
    } finally {
      this.inFlight.set(false);
    }
  }

  /**
   * The working query with paging widened, and nothing else changed.
   *
   * Built from `store.apiQuery()` so an export cannot describe a different
   * question from the table the user was just looking at.
   */
  private fetchAll(): Promise<Envelope<Observation>> {
    return firstValueFrom(
      this.macro.observations({ ...this.store.apiQuery(), page: 1, pageSize: EXPORT_PAGE_SIZE })
    );
  }

  private write(
    envelope: Envelope<Observation>,
    format: ExportFormat,
    pinVintages: boolean
  ): ExportOutcome {
    // A partial file that looks complete is worse than no file. Refuse, name
    // both numbers, and let the user narrow the query.
    if (envelope.meta.totalCount > envelope.data.length) {
      return {
        status: 'too-large',
        totalCount: envelope.meta.totalCount,
        limit: envelope.data.length
      };
    }

    const nowIso = this.now();

    this.downloader({
      filename: exportFilename(format, nowIso),
      mimeType: exportFormatSpec(format).mimeType,
      contents:
        format === 'json'
          ? toJson(envelope)
          : toCsv(envelope.data, envelope.meta, { pinVintages, nowIso })
    });

    return { status: 'saved', rows: envelope.data.length };
  }
}

/** The browser's only route to "save this": a detached, clicked anchor. */
function anchorDownload(file: ExportFile): void {
  const url = URL.createObjectURL(new Blob([file.contents], { type: file.mimeType }));
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = file.filename;
  anchor.click();

  // Revoked immediately: the click has already handed the blob to the browser,
  // and holding the URL keeps the whole payload alive for the page's lifetime.
  URL.revokeObjectURL(url);
}
