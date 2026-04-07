import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, switchMap } from 'rxjs/operators';
import { GeocodingResult, WeatherService } from '../../services/weather.service';

@Component({
  selector: 'app-search-popup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './search-popup.html',
  styleUrl: './search-popup.css'
})
export class SearchPopup implements OnInit, OnDestroy {
  @Input() isOpen = false;
  @Output() closed = new EventEmitter<void>();
  @Output() citySelected = new EventEmitter<GeocodingResult>();

  addSearchQuery = '';
  searchResults: GeocodingResult[] = [];
  pendingAdd = false;
  hasSearched = false;

  private searchSubject = new Subject<string>();
  private lastQuery = '';
  private lastResults: GeocodingResult[] = [];
  private ignoreIncomingResults = false;
  private isSelecting = false;
  private readonly minQueryLength = 3;
  private activeQuery = '';
  private requestCounter = 0;
  private latestRequestId = 0;
// Removed hardcoded cities - global search only via API/cache

  constructor(private weatherService: WeatherService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if ('isOpen' in changes) {
      if (this.isOpen) {
        this.ignoreIncomingResults = false;
        this.isSelecting = false;
      } else {
        this.ignoreIncomingResults = true;
        this.isSelecting = false;
        this.reset();
      }
    }
  }

  ngOnInit(): void {
    this.searchSubject.pipe(
      map((query) => query.trim()),
      debounceTime(200),
      distinctUntilChanged(),
      switchMap((query) => {
        if (this.ignoreIncomingResults || !this.isOpen || this.isSelecting) {
          return of({ query, results: [] as GeocodingResult[], requestId: this.latestRequestId });
        }

        if (query.length < this.minQueryLength) {
          return of({ query, results: [] as GeocodingResult[], requestId: this.latestRequestId });
        }

        const requestId = ++this.requestCounter;
        this.latestRequestId = requestId;

        return this.weatherService.searchCity(query).pipe(
          map((results) => this.rankResults(query, results).slice(0, 5)), // Max 5
          map((results) => ({ query, results, requestId })),
          catchError(() => of({ query, results: [] as GeocodingResult[], requestId }))
        );
      })
    ).subscribe(({ query, results, requestId }) => {
      if (this.ignoreIncomingResults || !this.isOpen) {
        return;
      }

      // Ignore stale responses and keep UI aligned with current input text.
      if (query !== this.activeQuery || requestId !== this.latestRequestId) {
        return;
      }

      this.searchResults = results;
      this.lastQuery = query.toLowerCase();
      this.lastResults = results;
      this.hasSearched = query.length >= this.minQueryLength;
      this.pendingAdd = false;
    });
  }

  ngOnDestroy(): void {
    this.searchSubject.complete();
  }

  close(): void {
    this.ignoreIncomingResults = true;
    this.reset();
    this.closed.emit();
  }

  onOverlayClick(): void {
    this.close();
  }

  onSearchQueryChange(value: string): void {
    this.addSearchQuery = value;
    const normalizedQuery = value.trim().toLowerCase();
    this.activeQuery = normalizedQuery;

    if (this.isSelecting) {
      return;
    }

    if (normalizedQuery.length < this.minQueryLength) {
      this.latestRequestId = ++this.requestCounter;
      this.pendingAdd = false;
      this.hasSearched = false;
      this.searchResults = [];
      return;
    }

    if (normalizedQuery.length >= this.minQueryLength) {
      const cachedSuggestions = this.weatherService.getCachedCitySuggestions(normalizedQuery);
      if (cachedSuggestions.length > 0) {
        this.searchResults = this.rankResults(normalizedQuery, cachedSuggestions).slice(0, 5);
        this.hasSearched = true;
        this.pendingAdd = false;
      } else {
        this.pendingAdd = true;
      }
    }

    if (normalizedQuery.length >= this.minQueryLength && this.lastQuery && normalizedQuery.startsWith(this.lastQuery) && this.lastResults.length > 0) {
      const filtered = this.lastResults.filter((city) => `${city.name}, ${city.country}`.toLowerCase().includes(normalizedQuery));
      this.searchResults = this.rankResults(normalizedQuery, filtered).slice(0, 5);
      this.hasSearched = true;
      this.pendingAdd = false;
    }

    this.searchSubject.next(value);
  }



  performAddSearch(): void {
    if (this.searchResults.length > 0) {
      this.selectCityForAdd(this.searchResults[0]);
      return;
    }

    const query = this.addSearchQuery.trim();
    if (!query) {
      return;
    }

    this.hasSearched = true;
    this.searchSubject.next(query);
  }

  selectCityForAdd(result: GeocodingResult): void {
    this.isSelecting = true;
    this.pendingAdd = false;
    this.hasSearched = false;
    this.searchResults = [];

    const selectedCity: GeocodingResult = { ...result };
    this.close();
    queueMicrotask(() => {
      this.citySelected.emit(selectedCity);
    });
  }

  onResultMouseDown(event: MouseEvent, result: GeocodingResult): void {
    event.preventDefault();
    this.selectCityForAdd(result);
  }

  private rankResults(query: string, results: GeocodingResult[]): GeocodingResult[] {
    const normalizedQuery = query.trim().toLowerCase();

    return [...results].sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();

      const aExact = aName === normalizedQuery ? 1 : 0;
      const bExact = bName === normalizedQuery ? 1 : 0;
      if (aExact !== bExact) {
        return bExact - aExact;
      }

      const aStarts = aName.startsWith(normalizedQuery) ? 1 : 0;
      const bStarts = bName.startsWith(normalizedQuery) ? 1 : 0;
      if (aStarts !== bStarts) {
        return bStarts - aStarts;
      }

      const aContains = aName.includes(normalizedQuery) ? 1 : 0;
      const bContains = bName.includes(normalizedQuery) ? 1 : 0;
      if (aContains !== bContains) {
        return bContains - aContains;
      }

      return aName.localeCompare(bName);
    });
  }

  private reset(): void {
    this.addSearchQuery = '';
    this.searchResults = [];
    this.pendingAdd = false;
    this.hasSearched = false;
    this.lastQuery = '';
    this.lastResults = [];
  }

}
