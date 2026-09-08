import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { Api } from './core/api';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  private readonly api = inject(Api);

  protected readonly title = signal('Micro Economics');
  protected readonly apiStatus = signal('checking…');

  constructor() {
    this.api.health().subscribe({
      next: (health) => this.apiStatus.set(health.status),
      error: () => this.apiStatus.set('unreachable')
    });
  }
}
