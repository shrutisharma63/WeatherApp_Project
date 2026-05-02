import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, OnDestroy, ElementRef, ViewChild, Inject } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { WeatherService, GeocodingResult } from '../../services/weather.service';
import { Subject, of, fromEvent } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, switchMap, takeUntil, timeout } from 'rxjs/operators';

@Component({
  selector: 'app-search-bar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './search-bar.component.html',
  styleUrls: ['./search-bar.component.css', './autocomplete.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SearchBarComponent implements OnInit, OnDestroy {
  private readonly maxSuggestions = 8;
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

  activeCity = '';
  searchQuery: string = '';
  searchResults: GeocodingResult[] = [];
  selectedSuggestion: GeocodingResult | null = null;
  loadingSuggestions = false;
  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();
  private suggestionCache = new Map<string, GeocodingResult[]>();
  showResults = false;
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

  constructor(public weatherService: WeatherService, private cdr: ChangeDetectorRef, @Inject(DOCUMENT) private document: Document) {}

  ngOnInit(): void {
    this.searchSubject.pipe(
      debounceTime(80),
      map((query) => query.trim()),
      distinctUntilChanged(),
      switchMap((query) => {
        if (!query) {
          this.loadingSuggestions = false;
          return of({ query, results: [] as GeocodingResult[], loading: false });
        }

        this.loadingSuggestions = true;
        const instantResults = this.getInstantSuggestions(query);

        return this.weatherService.searchCity(query).pipe(
          timeout(3000),
          map((apiResults) => ({
            query,
            results: this.mergeAndRankSuggestions(query, [...instantResults, ...apiResults]).slice(0, this.maxSuggestions),
            loading: false
          })),
          catchError(() => of({
            query,
            results: instantResults,
            loading: false
          }))
        );
      }),
      takeUntil(this.destroy$)
    ).subscribe(({ query, results, loading }) => {
      if (query !== this.searchQuery.trim()) {
        return;
      }

      this.suggestionCache.set(query.toLowerCase(), results);
      this.searchResults = results;
      this.showResults = query.length >= 1;
      this.loadingSuggestions = loading;
    });

    // Close suggestions when clicking outside the search bar
    fromEvent<MouseEvent>(this.document, 'click')
      .pipe(takeUntil(this.destroy$))
      .subscribe((event: MouseEvent) => {
        const target = event.target as HTMLElement | null;
        if (!target) return;
        
        // Check if click is outside the search wrapper
        const searchWrapper = this.document.querySelector('.search-wrap');
        if (searchWrapper && !searchWrapper.contains(target)) {
          this.closeSuggestions();
        }
      });

    // Set Kishangarh as your preferred city
    console.log('🌍 Initializing with Kishangarh as your city...');
    this.weatherService.setPreferredCity('Kishangarh');
  }

  onSearchInput(event: any): void {
    const value = String(event?.target?.value ?? '');
    this.handleSearchInput(value);
  }

  onSearchInputFocus(): void {
    this.showResults = this.searchQuery.trim().length >= 1 && this.searchResults.length > 0;
  }

  private handleSearchInput(value: string): void {
    this.searchQuery = value;
    const normalized = value.trim().toLowerCase();

    if (!normalized) {
      this.searchResults = [];
      this.showResults = false;
      this.selectedSuggestion = null;
      this.loadingSuggestions = false;
      this.searchSubject.next(value);
      return;
    }

    const instantResults = this.getInstantSuggestions(value);
    this.searchResults = instantResults;
    this.showResults = true;
    this.loadingSuggestions = instantResults.length === 0;

    if (this.selectedSuggestion) {
      const selectedLabel = `${this.selectedSuggestion.name}, ${this.selectedSuggestion.country}`.toLowerCase();
      if (selectedLabel !== normalized) {
        this.selectedSuggestion = null;
      }
    }

    this.searchSubject.next(value);
  }

  onSearchBarClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button') || target?.closest('input')) {
      return;
    }

    this.focusSearchInput();
    this.cdr.markForCheck();
  }

  onLocationClick(): void {
    this.weatherService.getUserLocationWeather();
  }

  async onTopCitySelect(city: { label: string; query: string }): Promise<void> {
    this.activeCity = city.label;
    this.searchQuery = city.query;
    this.selectedSuggestion = null;
    this.showResults = false;
    await this.weatherService.searchWeather(city.query);
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
    this.searchQuery = result.name;
    this.activeCity = result.name;
    this.selectedSuggestion = result;
    this.showResults = false;
    this.loadingSuggestions = false;
    this.cdr.markForCheck();
    this.focusSearchInput(true);
    
    // Log selected city and coordinates for debugging
    console.log(`🌍 City selected: ${result.name}, Lat: ${result.latitude}, Lon: ${result.longitude}`);
    
    // Load weather for the selected city
    this.weatherService.searchWeatherBySelection(result).then(() => {
      this.cdr.markForCheck();
    });
  }

  async onSearch(): Promise<void> {
    if (!this.searchQuery.trim()) {
      this.weatherService.error.set('Please enter a city name to continue.');
      this.showResults = false;
      return;
    }

    const query = this.searchQuery.trim();
    this.showResults = false;

    if (this.selectedSuggestion) {
      const selectedCity = this.selectedSuggestion.name.toLowerCase();
      const selectedLabel = `${this.selectedSuggestion.name}, ${this.selectedSuggestion.country}`.toLowerCase();
      const normalizedQuery = query.toLowerCase();
      if (selectedLabel === normalizedQuery || selectedCity === normalizedQuery) {
        this.activeCity = this.selectedSuggestion.name;
        await this.weatherService.searchWeatherBySelection(this.selectedSuggestion);
        return;
      }
    }

    const normalizedQuery = query.toLowerCase();
    const localSuggestions = this.searchResults.length > 0
      ? this.searchResults
      : this.weatherService.getCachedCitySuggestions(query);
    const bestMatch = localSuggestions.find((item) => item.name.toLowerCase() === normalizedQuery) || null;
    if (bestMatch) {
      this.selectedSuggestion = bestMatch;
      this.activeCity = bestMatch.name;
      await this.weatherService.searchWeatherBySelection(bestMatch);
      return;
    }

    this.selectedSuggestion = null;
    await this.weatherService.searchWeather(query);
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      void this.onSearch();
    }
  }

  clearSearch(): void {
    // Immediately clear the UI without waiting
    this.searchQuery = '';
    this.searchResults = [];
    this.selectedSuggestion = null;
    this.showResults = false;
    this.loadingSuggestions = false;
    this.weatherService.error.set(null);
    this.cdr.markForCheck();
    this.focusSearchInput();

    // Reload the weather in the background (non-blocking)
    void this.weatherService.searchWeather(this.activeCity);
  }

  private focusSearchInput(placeCaretAtEnd = false): void {
    const input = this.searchInput?.nativeElement;
    if (!input) {
      return;
    }

    // Immediate focus without delay for responsiveness
    input.focus({ preventScroll: true });
    if (placeCaretAtEnd) {
      const end = input.value.length;
      input.setSelectionRange(end, end);
    }
  }

  private getCurrentCityName(): string {
    const location = this.weatherService.currentWeather()?.location || this.activeCity || '';
    return location.split(',')[0]?.trim() || '';
  }

  private getInstantSuggestions(query: string): GeocodingResult[] {
    if (query.length < 1) {
      return [];
    }

    const normalized = query.toLowerCase();
    const componentCached = this.suggestionCache.get(normalized);
    if (componentCached) {
      return componentCached.slice(0, this.maxSuggestions);
    }

    const instant = this.mergeAndRankSuggestions(query, this.weatherService.getInstantCitySuggestions(query))
      .slice(0, this.maxSuggestions);
    this.suggestionCache.set(normalized, instant);
    return instant;
  }

  private mergeAndRankSuggestions(query: string, source: GeocodingResult[]): GeocodingResult[] {
    const normalized = query.trim().toLowerCase();
    const merged = [...source, ...this.curatedSuggestions];
    const unique = new Map<string, GeocodingResult>();
    const itemsWithLabels: Array<{ item: GeocodingResult; label: string; score: number }> = [];

    // Deduplicate and create labels once
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

    // Filter and score in one pass
    for (const item of unique.values()) {
      const label = `${item.name} ${item.admin1 || ''} ${item.country}`.toLowerCase();
      if (label.includes(normalized) || this.isFuzzyMatch(label, normalized)) {
        const score = this.getFuzzyScore(label, normalized);
        itemsWithLabels.push({ item, label, score });
      }
    }

    // Sort with pre-computed scores
    return itemsWithLabels
      .sort((a, b) => {
        if (a.score !== b.score) {
          return b.score - a.score;
        }

        const aRegionBoost = this.getRegionBoost(a.item);
        const bRegionBoost = this.getRegionBoost(b.item);
        if (aRegionBoost !== bRegionBoost) {
          return bRegionBoost - aRegionBoost;
        }

        const aStarts = a.item.name.toLowerCase().startsWith(normalized) ? 1 : 0;
        const bStarts = b.item.name.toLowerCase().startsWith(normalized) ? 1 : 0;
        if (aStarts !== bStarts) {
          return bStarts - aStarts;
        }
        return a.item.name.toLowerCase().localeCompare(b.item.name.toLowerCase());
      })
      .map(({ item }) => item);
  }

  private isFuzzyMatch(text: string, query: string): boolean {
    if (!query) {
      return false;
    }

    let index = 0;
    for (let i = 0; i < text.length && index < query.length; i++) {
      if (text[i] === query[index]) {
        index++;
      }
    }

    return index === query.length;
  }

  private getFuzzyScore(text: string, query: string): number {
    if (!query) {
      return 0;
    }

    if (text.startsWith(query)) {
      return 100 + query.length;
    }

    if (text.includes(query)) {
      return 70 + query.length;
    }

    if (this.isFuzzyMatch(text, query)) {
      return 40 + query.length;
    }

    return 0;
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

  trackBySuggestion(_: number, suggestion: GeocodingResult): string {
    return `${suggestion.name}|${suggestion.country}|${suggestion.admin1 || ''}|${suggestion.latitude}|${suggestion.longitude}`;
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

  private closeSuggestions(): void {
    if (this.showResults) {
      this.showResults = false;
      this.cdr.markForCheck();
    }
  }
}
