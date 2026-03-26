import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, of } from 'rxjs';
import { distinctUntilChanged, finalize, map, switchMap, tap } from 'rxjs/operators';
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
// Removed hardcoded cities - global search only via API/cache

  constructor(private weatherService: WeatherService) {}

  ngOnInit(): void {
    this.searchSubject.pipe(
      map((query) => query.trim()),
      distinctUntilChanged(),
      tap((query) => {
        if (query.length <= 2) {
          this.searchResults = [];
          this.hasSearched = false;
          this.pendingAdd = false;
          this.lastQuery = '';
          this.lastResults = [];
          return;
        }

        this.hasSearched = true;
        this.pendingAdd = true;
      }),
      switchMap((query) => {
        if (query.length <= 2) {
          return of({ query, results: [] as GeocodingResult[] });
        }

          return this.weatherService.searchCity(query).pipe(
          map((results) => results.slice(0, 5)), // Max 5
          map((results) => ({ query, results })),
          finalize(() => {
            this.pendingAdd = false;
          })
        );
      })
    ).subscribe(({ query, results }) => {
      this.searchResults = results;
      this.lastQuery = query.toLowerCase();
      this.lastResults = results;
    });
  }

  ngOnDestroy(): void {
    this.searchSubject.complete();
  }

  close(): void {
    this.reset();
    this.closed.emit();
  }

  onOverlayClick(): void {
    this.close();
  }

  onSearchQueryChange(value: string): void {
    this.addSearchQuery = value;
    const normalizedQuery = value.trim().toLowerCase();

    if (normalizedQuery.length > 2) {
      const cachedSuggestions = this.weatherService.getCachedCitySuggestions(normalizedQuery);
      if (cachedSuggestions.length > 0) {
        this.searchResults = cachedSuggestions;
        this.hasSearched = true;
      }
    }

    if (normalizedQuery.length > 2 && this.lastQuery && normalizedQuery.startsWith(this.lastQuery) && this.lastResults.length > 0) {
      this.searchResults = this.lastResults.filter((city) => `${city.name}, ${city.country}`.toLowerCase().includes(normalizedQuery));
      this.hasSearched = true;
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
    this.citySelected.emit(result);
    this.close();
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
