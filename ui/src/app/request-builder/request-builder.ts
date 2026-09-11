import { Component, computed, effect, inject, signal } from '@angular/core';

import { REQUEST_CLIPBOARD } from '../core/request/request-clipboard';
import { RequestSendService, type SendResult } from '../core/request/request-send.service';
import {
  REQUEST_ENDPOINTS,
  type RequestEndpoint,
  type RequestEndpointSpec,
  consumerUrl,
  curlCommand,
  proxyUrl
} from '../core/request/request-text';
import { WorkingQueryStore } from '../core/working-query.store';
import { WorkingQueryCard } from '../query/working-query-card';

interface StatusRow {
  readonly status: string;
  readonly meaning: string;
  readonly cause: string;
}

/** The reference table, verbatim from the design and the overview's list. */
const STATUS_ROWS: readonly StatusRow[] = [
  {
    status: '400',
    meaning: 'ProblemDetails, detail names the issue',
    cause: 'Unknown indicator or ISO3, yearFrom > yearTo, missing indicators'
  },
  { status: '401', meaning: 'Not authenticated', cause: 'Missing or expired token — refresh and retry' },
  {
    status: '404',
    meaning: 'Not found',
    cause: 'Unknown indicator on /indicators/{code}, unknown vintage'
  },
  { status: '304', meaning: 'Not modified', cause: 'Your cached copy is still current (ETag hit)' },
  { status: '5xx', meaning: 'Server fault', cause: 'Never caused by upstream outages — report it' }
];

/**
 * The request builder: the working query as the request a consumer would make.
 *
 * Two URLs exist here on purpose and the template says so. The block a user
 * copies names the Core API host as a placeholder, because that host is a secret
 * this browser has no way to learn. `Send request` calls this console's own
 * passthrough, which is the only origin it can reach and the only one holding a
 * token. Showing one and silently calling the other would teach the wrong thing.
 */
@Component({
  selector: 'app-request-builder',
  imports: [WorkingQueryCard],
  templateUrl: './request-builder.html',
  styleUrl: './request-builder.scss'
})
export class RequestBuilderPage {
  private readonly store = inject(WorkingQueryStore);
  private readonly sender = inject(RequestSendService);
  private readonly clipboard = inject(REQUEST_CLIPBOARD);

  protected readonly endpoints = REQUEST_ENDPOINTS;
  protected readonly statusRows = STATUS_ROWS;

  protected readonly endpoint = signal<RequestEndpoint>('series');
  protected readonly busy = this.sender.busy;

  /** Null until the first send. */
  protected readonly result = signal<SendResult | null>(null);

  /** The copy button's own message, cleared by the next change. */
  protected readonly copied = signal<string | null>(null);

  protected selectEndpoint(spec: RequestEndpointSpec): void {
    // Setting the same value does not notify — signals compare with `Object.is`
    // — so re-selecting the current endpoint leaves a settled answer alone
    // without needing a guard here.
    this.endpoint.set(spec.endpoint);
  }

  protected isSelected(spec: RequestEndpointSpec): boolean {
    return this.endpoint() === spec.endpoint;
  }

  protected readonly valid = computed(() => this.store.validation().valid);

  /**
   * The query as the request would carry it.
   *
   * `apiQuery` is only meaningful while the query is valid, so the URL blocks
   * render the invalid state's explanation instead of a URL nobody could send.
   */
  private readonly query = this.store.apiQuery;

  protected readonly consumerUrl = computed(() => consumerUrl(this.endpoint(), this.query()));
  protected readonly proxyUrl = computed(() => proxyUrl(this.endpoint(), this.query()));

  /**
   * The previous answer described a different request, so it goes.
   *
   * Keyed on the URL rather than the endpoint because the URL *is* the request:
   * the working-query card sits directly above on this page, so an indicator, a
   * country or a year moves it just as surely as the endpoint select does. The
   * copy confirmation goes with it, since the curl it named has changed too.
   */
  private readonly clearOnRequestChange = effect(() => {
    this.proxyUrl();
    this.result.set(null);
    this.copied.set(null);
  });

  /** The validator that would ride along, or null when none belongs to this request. */
  protected readonly heldEtag = computed(() => {
    // Read through the result so a send refreshes this without a second signal.
    this.result();
    return this.valid() ? this.sender.heldEtag(this.endpoint(), this.query()) : null;
  });

  protected readonly curl = computed(() => curlCommand(this.consumerUrl(), this.heldEtag()));

  protected readonly canSend = computed(() => this.valid() && !this.busy());

  protected readonly blockedReason = computed(() =>
    this.valid() ? null : 'Add at least one indicator before sending this request.'
  );

  // ---------- sending ----------

  protected async send(): Promise<void> {
    if (!this.canSend()) {
      return;
    }

    this.copied.set(null);

    // The in-flight window. Editing the query while this is out there fires the
    // effect above, which clears the card — and then this line would put the old
    // query's answer straight back, into a card whose URL block now shows a
    // different request. Captured before the await, compared after, exactly as
    // `result-state.ts` captures the query it asked for.
    const asked = this.proxyUrl();
    const outcome = await this.sender.send(this.endpoint(), this.query());

    if (this.proxyUrl() === asked) {
      this.result.set(outcome);
    }
  }

  protected readonly sent = computed(() => this.result() !== null);

  /** `Not sent`, or the status the service actually returned. */
  protected readonly statusLabel = computed(() => {
    const result = this.result();

    if (result === null) {
      return 'Not sent';
    }

    return result.kind === 'unreachable' ? 'No answer' : String(result.status);
  });

  protected readonly statusTone = computed(() => {
    const result = this.result();

    if (result === null) {
      return 'idle';
    }
    if (result.kind === 'unreachable') {
      return 'bad';
    }
    if (result.status === 304) {
      return 'cached';
    }

    return result.status >= 200 && result.status < 300 ? 'good' : 'bad';
  });

  private readonly response = computed(() => {
    const result = this.result();
    return result !== null && result.kind === 'response' ? result : null;
  });

  protected readonly unreachable = computed(() => this.result()?.kind === 'unreachable');

  protected readonly unreachableMessage = computed(() => {
    const result = this.result();
    return result?.kind === 'unreachable' ? result.message : '';
  });

  protected readonly elapsed = computed(() => this.response()?.elapsedMs ?? null);

  /** An em dash for a header the response did not carry. Never a guess. */
  protected readonly etag = computed(() => this.response()?.headers.etag ?? '—');
  protected readonly cacheControl = computed(() => this.response()?.headers.cacheControl ?? '—');
  protected readonly totalCount = computed(() => this.response()?.headers.totalCount ?? '—');

  /**
   * The body, pretty-printed when it parses as JSON.
   *
   * Rendered raw when it does not: an HTML error page from something in front of
   * the service is still what came back, and hiding it would leave the user with
   * nothing to act on.
   */
  protected readonly body = computed(() => {
    const response = this.response();

    if (response === null) {
      return '';
    }
    if (response.status === 304) {
      return '';
    }

    try {
      return JSON.stringify(JSON.parse(response.body), null, 2);
    } catch {
      return response.body;
    }
  });

  protected readonly bodyNote = computed(() => {
    const response = this.response();

    if (response === null) {
      return 'Press Send request to see the response envelope.';
    }
    if (response.status === 304) {
      return 'Not modified: your cached copy is still current, so there is no body.';
    }

    return null;
  });

  // ---------- copying ----------

  protected async copyCurl(): Promise<void> {
    try {
      await this.clipboard(this.curl());
      this.copied.set('curl copied.');
    } catch {
      // Ordinary, not exceptional: an insecure origin or a denied permission.
      // The curl stays on screen to be selected by hand.
      this.copied.set('Could not copy. Select the command above instead.');
    }
  }
}
