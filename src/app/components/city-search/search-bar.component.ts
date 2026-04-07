import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WeatherService, GeocodingResult } from '../../services/weather.service';
import { Subject, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, takeUntil, map, catchError } from 'rxjs/operators';

@Component({
  selector: 'app-search-bar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './search-bar.component.html',
  styleUrls: ['./search-bar.component.css', './autocomplete.css']
})
export class SearchBarComponent implements OnInit, OnDestroy {
  private readonly preferredRegion = { country: 'india', state: 'rajasthan' };
  private readonly curatedSuggestions: GeocodingResult[] = [
    { name: 'Jaipur', latitude: 26.9124, longitude: 75.7873, country: 'India', admin1: 'Rajasthan' },
    { name: 'Jaisalmer', latitude: 26.9157, longitude: 70.9083, country: 'India', admin1: 'Rajasthan' },
    { name: 'Kishangarh', latitude: 26.5901, longitude: 74.854, country: 'India', admin1: 'Rajasthan' },
    { name: 'Kishanganj', latitude: 25.6839, longitude: 86.9858, country: 'India', admin1: 'Bihar' },
    { name: 'Ajmer', latitude: 26.4499, longitude: 74.6399, country: 'India', admin1: 'Rajasthan' }
  ];

  topCities: Array<{ label: string; query: string; icon: string; temp: number }> = [
    { label: 'Jaipur', query: 'Jaipur', icon: '⛅', temp: 34 },
    { label: 'London', query: 'London', icon: '🌧️', temp: 16 },
    { label: 'Jaisalmer', query: 'Jaisalmer', icon: '☀️', temp: 37 },
    { label: 'Kishangarh', query: 'Kishangarh', icon: '⛈️', temp: 30 }
  ];

  alerts: Array<{ icon: string; title: string; detail: string }> = [
    { icon: '⚡', title: 'Lightning Strike', detail: 'Moderate chance this evening' },
    { icon: '⛈️', title: 'Severe Thunderstorm', detail: 'Watch window 5 PM - 8 PM' }
  ];

  activeCity = 'Kishangarh';
  searchQuery: string = '';
  searchResults: GeocodingResult[] = [];
  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();
  showResults = false;

  constructor(public weatherService: WeatherService) {}

  ngOnInit(): void {
    this.searchSubject.pipe(
      debounceTime(200),
      map((query) => query.trim()),
      distinctUntilChanged(),
      switchMap((query) => {
        if (query.length < 2) {
          return of([] as GeocodingResult[]);
        }

        const cached = this.weatherService.getCachedCitySuggestions(query);
        return this.weatherService.searchCity(query).pipe(
          map((apiResults) => this.mergeAndRankSuggestions(query, [...cached, ...apiResults])),
          catchError(() => of(this.mergeAndRankSuggestions(query, cached)))
        );
      }),
      takeUntil(this.destroy$)
    ).subscribe(results => {
      this.searchResults = results.slice(0, 8);
      this.showResults = this.searchQuery.trim().length >= 2;

      // Dynamic trigger: if user typed enough and there is an exact start match, fetch quickly.
      if (this.searchQuery.trim().length > 2 && results.length > 0) {
        const normalized = this.searchQuery.trim().toLowerCase();
        const best = results.find((item) => item.name.toLowerCase().startsWith(normalized)) || results[0];
        if (best && normalized.length >= 4) {
          this.weatherService.searchWeather(best.name);
        }
      }
    });

    // Weather is loaded from weather-display component by default
  }

  onSearchInput(event: any): void {
    this.searchSubject.next(event.target.value);
  }

  onLocationClick(): void {
    this.weatherService.getUserLocationWeather();
  }

  onTopCitySelect(city: { label: string; query: string }): void {
    this.activeCity = city.label;
    this.searchQuery = city.query;
    this.showResults = false;
    this.weatherService.searchWeather(city.query);
  }

  getTabTemperature(city: { label: string; temp: number }): string {
    if (city.label === this.activeCity && this.weatherService.currentWeather()) {
      return `${this.weatherService.currentWeather()!.current.temperature}°`;
    }
    return `${city.temp}°`;
  }

  getTabIcon(city: { label: string; icon: string }): string {
    if (city.label === this.activeCity && this.weatherService.currentWeather()) {
      return this.weatherService.getWeatherIcon(this.weatherService.currentWeather()!.current.weatherCode);
    }
    return city.icon;
  }

  selectResult(result: GeocodingResult): void {
    this.searchQuery = `${result.name}, ${result.country}`;
    this.activeCity = result.name;
    this.showResults = false;
    this.weatherService.searchWeather(result.name);
  }

  onSearch(): void {
    if (!this.searchQuery.trim()) {
      this.weatherService.error.set('Please enter a city name to continue.');
      return;
    }
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
    this.weatherService.error.set(null);
  }

  private mergeAndRankSuggestions(query: string, source: GeocodingResult[]): GeocodingResult[] {
    const normalized = query.trim().toLowerCase();
    const merged = [...source, ...this.curatedSuggestions];
    const unique = new Map<string, GeocodingResult>();

    for (const item of merged) {
      if (!item?.name || !item?.country) {
        continue;
      }

      const cleanItem: GeocodingResult = {
        name: item.name.trim(),
        latitude: Number(item.latitude),
        longitude: Number(item.longitude),
        country: item.country.trim(),
        admin1: item.admin1?.trim() || undefined
      };

      if (!Number.isFinite(cleanItem.latitude) || !Number.isFinite(cleanItem.longitude)) {
        continue;
      }

      const key = `${item.name}|${item.country}|${item.admin1 || ''}`.toLowerCase();
      if (!unique.has(key)) {
        unique.set(key, cleanItem);
      }
    }

    return Array.from(unique.values())
      .filter((item) => {
        const label = `${item.name} ${item.admin1 || ''} ${item.country}`.toLowerCase();
        return label.includes(normalized);
      })
      .sort((a, b) => {
        const aRegionBoost = this.getRegionBoost(a);
        const bRegionBoost = this.getRegionBoost(b);
        if (aRegionBoost !== bRegionBoost) {
          return bRegionBoost - aRegionBoost;
        }

        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        const aStarts = aName.startsWith(normalized) ? 1 : 0;
        const bStarts = bName.startsWith(normalized) ? 1 : 0;
        if (aStarts !== bStarts) {
          return bStarts - aStarts;
        }
        return aName.localeCompare(bName);
      });
  }

  private getRegionBoost(item: GeocodingResult): number {
    const country = (item.country || '').toLowerCase();
    const state = (item.admin1 || '').toLowerCase();
    let score = 0;

    if (country === this.preferredRegion.country) {
      score += 2;
    }

    if (state === this.preferredRegion.state) {
      score += 4;
    }

    return score;
  }

  hasWeatherResult(): boolean {
    return this.weatherService.isValidWeatherData(this.weatherService.currentWeather());
  }

  getWeatherIcon(): string {
    const weather = this.weatherService.currentWeather();
    if (!weather) {
      return '🌤️';
    }
    return this.weatherService.getWeatherIcon(weather.current.weatherCode);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.searchSubject.complete();
  }
}

