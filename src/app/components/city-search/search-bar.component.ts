import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WeatherService, GeocodingResult } from '../../services/weather.service';
import { Subject, Observable, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-search-bar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './search-bar.component.html',
  styleUrls: ['./city-search.component.css', './autocomplete.css']
})
export class SearchBarComponent implements OnInit, OnDestroy {
  searchQuery: string = '';
  searchResults: GeocodingResult[] = [];
  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();
  showResults = false;

  constructor(public weatherService: WeatherService) {}

  ngOnInit(): void {
    this.searchSubject.pipe(
      debounceTime(200),
      switchMap(query => of(this.weatherService.getCachedCitySuggestions(query))),
      takeUntil(this.destroy$)
    ).subscribe(results => {
      this.searchResults = results;
      this.showResults = this.searchQuery.length > 2 && results.length > 0;
    });

    // Weather is loaded from weather-display component by default
  }

  onSearchInput(event: any): void {
    this.searchSubject.next(event.target.value);
  }

  onLocationClick(): void {
    this.weatherService.getUserLocationWeather();
  }

  selectResult(result: GeocodingResult): void {
    this.searchQuery = `${result.name}, ${result.country}`;
    this.showResults = false;
    this.weatherService.searchWeather(this.searchQuery);
  }

  onSearch(): void {
    console.log('Search triggered with query:', this.searchQuery);
    this.weatherService.searchWeather(this.searchQuery);
    this.showResults = false;
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.onSearch();
    }
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.searchResults = [];
    this.showResults = false;
    // No default - user can search any city
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.searchSubject.complete();
  }
}

