import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, catchError, of, throwError, tap, switchMap, EMPTY, firstValueFrom } from 'rxjs';

export interface WeatherData {
  location: string;
  latitude?: number;
  longitude?: number;
  current: {
    temperature: number;
    weatherCode: number;
    humidity: number;
    windSpeed: number;
    feelsLike: number;
    uvIndex?: number;
    precipitation?: number;
    pressure?: number;
    visibility?: number;
  };
  hourly: HourlyForecast[];
  forecast: DailyForecast[];
}

export interface HourlyForecast {
  time: string;
  temperature: number;
  weatherCode: number;
  humidity: number;
  windSpeed: number;
  precipitationProbability: number;
}

export interface DailyForecast {
  date: string;
  temperatureMax: number;
  temperatureMin: number;
  weatherCode: number;
  humidity?: number;
  windSpeed?: number;
  precipitationProbability?: number;
  sunrise?: string;
  sunset?: string;
}

export interface GeocodingResult {
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  admin1?: string;  // State name
}

@Injectable({
  providedIn: 'root'
})
export class WeatherService {

  private geocodingApiUrl = 'https://geocoding-api.open-meteo.com/v1/search';
  private weatherApiUrl = 'https://api.open-meteo.com/v1/forecast';
  private readonly curatedCities: GeocodingResult[] = [
    { name: 'Jaipur', latitude: 26.9124, longitude: 75.7873, country: 'India', admin1: 'Rajasthan' },
    { name: 'Jaisalmer', latitude: 26.9157, longitude: 70.9083, country: 'India', admin1: 'Rajasthan' },
    { name: 'Kishangarh', latitude: 26.5918, longitude: 74.8518, country: 'India', admin1: 'Rajasthan' },
    { name: 'Kishanganj', latitude: 25.6839, longitude: 86.9858, country: 'India', admin1: 'Bihar' },
    { name: 'Ajmer', latitude: 26.4499, longitude: 74.6399, country: 'India', admin1: 'Rajasthan' }
  ];
  private readonly fallbackCity = 'Kishangarh';
  private fallbackCoordinates = { latitude: 26.5918, longitude: 74.8518 };
  private lockPreferredCity = true;
  private cachedWeatherKey = 'my-weather-app:last-known-weather';
  private userLocationCacheKey = 'my-weather-app:user-location-cache';
  private readonly userLocationCacheTtlMs = 7 * 24 * 60 * 60 * 1000; // 7 days
  private citySearchCache = new Map<string, GeocodingResult[]>();
  private citySuggestionIndex = new Map<string, GeocodingResult[]>();
  private weatherResponseCache = new Map<string, { data: WeatherData; timestamp: number }>();
  private readonly weatherCacheTtlMs = 15 * 60 * 1000; // 15 minutes for fresher data
  private inFlightWeatherSearches = new Map<string, Promise<void>>();
  private readonly preferredCityKey = 'my-weather-app:preferred-city';

  private weatherCodes: { [key: number]: string } = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    56: 'Light freezing drizzle',
    57: 'Dense freezing drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    66: 'Light freezing rain',
    67: 'Heavy freezing rain',
    71: 'Slight snow',
    73: 'Moderate snow',
    75: 'Heavy snow',
    77: 'Snow grains',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    85: 'Slight snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail'
  };

  currentWeather = signal<WeatherData | null>(null);
  isLoading = signal<boolean>(false);
  error = signal<string | null>(null);
  initialized = signal<boolean>(false);
  temperatureUnit = signal<string>('celsius');

  constructor(private http: HttpClient) {
    if (typeof window !== 'undefined') {
      void this.loadIndianCities();

      // Always render something immediately on refresh, then update in background.
      const hydratedFromCache = this.hydrateWeatherFromCache();
      if (!hydratedFromCache) {
        const emergency = this.buildEmergencyWeather();
        this.currentWeather.set(emergency);
        this.initialized.set(true);
        this.error.set(null);
        this.notifyWeatherReady();
      } else {
        this.notifyWeatherReady();
      }

      this.refreshPreferredCityWeather();
    }
  }

  private refreshPreferredCityWeather(): void {
    this.getWeather(
      this.fallbackCoordinates.latitude,
      this.fallbackCoordinates.longitude,
      `${this.fallbackCity}, India`
    ).subscribe({
      next: (weatherData) => {
        this.currentWeather.set(weatherData);
        this.error.set(null);
        this.initialized.set(true);
      },
      error: () => {
        // If preferred city refresh fails, keep or load Kishangarh fallback instead of IP-based override.
        this.loadFallbackCityWeather();
      }
    });
  }

  private notifyWeatherReady(): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.dispatchEvent(new CustomEvent('weather-ready'));
  }

  private hydrateWeatherFromCache(): boolean {
    const cached = this.readLastKnownWeather();
    if (!cached) {
      return false;
    }

    this.currentWeather.set(cached);
    this.initialized.set(true);
    this.error.set(null);
    return true;
  }

  private loadDefaultCityWeather(): void {
    if (this.currentWeather() || this.isLoading()) {
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);
    this.loadFallbackCityWeather();
  }

  setTemperatureUnit(unit: string): void {
    const currentUnit = this.temperatureUnit();
    if (unit === currentUnit) {
      return;
    }

    this.temperatureUnit.set(unit);

    const weather = this.currentWeather();
    if (weather) {
      const convertedWeather = { ...weather };
      convertedWeather.current = { ...weather.current };

      if (unit === 'fahrenheit') {
        convertedWeather.current.temperature = Math.round(weather.current.temperature * 9 / 5 + 32);
        convertedWeather.current.feelsLike = Math.round(weather.current.feelsLike * 9 / 5 + 32);
      } else {
        convertedWeather.current.temperature = Math.round((weather.current.temperature - 32) * 5 / 9);
        convertedWeather.current.feelsLike = Math.round((weather.current.feelsLike - 32) * 5 / 9);
      }

      convertedWeather.hourly = weather.hourly.map(h => ({
        ...h,
        temperature: unit === 'fahrenheit'
          ? Math.round(h.temperature * 9 / 5 + 32)
          : Math.round((h.temperature - 32) * 5 / 9)
      }));

      convertedWeather.forecast = weather.forecast.map(f => ({
        ...f,
        temperatureMax: unit === 'fahrenheit'
          ? Math.round(f.temperatureMax * 9 / 5 + 32)
          : Math.round((f.temperatureMax - 32) * 5 / 9),
        temperatureMin: unit === 'fahrenheit'
          ? Math.round(f.temperatureMin * 9 / 5 + 32)
          : Math.round((f.temperatureMin - 32) * 5 / 9)
      }));

      this.currentWeather.set(convertedWeather);
    }
  }

  getWeatherIcon(weatherCode: number): string {
    if (weatherCode === 0) return '☀️';
    if (weatherCode <= 3) return '⛅';
    if (weatherCode >= 45 && weatherCode <= 48) return '🌫️';
    if (weatherCode >= 51 && weatherCode <= 57) return '🌧️';
    if (weatherCode >= 61 && weatherCode <= 67) return '🌧️';
    if (weatherCode >= 71 && weatherCode <= 77) return '❄️';
    if (weatherCode >= 80 && weatherCode <= 82) return '🌦️';
    if (weatherCode >= 85 && weatherCode <= 86) return '🌨️';
    if (weatherCode >= 95) return '⛈️';
    return '🌤️';
  }

  getWeatherDescription(weatherCode: number): string {
    return this.weatherCodes[weatherCode] || 'Unknown';
  }

  getCachedCitySuggestions(cityName: string): GeocodingResult[] {
    const normalizedCity = cityName.trim().toLowerCase();
    if (normalizedCity.length < 1) {
      return [];
    }

    const indexed = this.citySuggestionIndex.get(normalizedCity);
    if (indexed && indexed.length > 0) {
      return indexed;
    }

    const exact = this.citySearchCache.get(normalizedCity);
    if (exact) {
      return exact;
    }

    let bestKey = '';
    let bestResults: GeocodingResult[] = [];

    for (const [key, results] of this.citySearchCache.entries()) {
      if (normalizedCity.startsWith(key) && key.length > bestKey.length) {
        bestKey = key;
        bestResults = results;
      }
    }

    if (bestResults.length === 0) {
      return [];
    }

    return bestResults.filter((city) => {
      const cityLabel = `${city.name}, ${city.country}`.toLowerCase();
      return cityLabel.includes(normalizedCity);
    });
  }

  getInstantCitySuggestions(cityName: string): GeocodingResult[] {
    const normalizedCity = cityName.trim().toLowerCase();
    if (!normalizedCity) {
      return [];
    }

    return this.getCachedCitySuggestions(normalizedCity).slice(0, 8);
  }

  searchCity(cityName: string): Observable<GeocodingResult[]> {
    const normalizedCity = cityName.trim().toLowerCase();
    if (!normalizedCity) {
      return of([]);
    }

    const cached = this.citySearchCache.get(normalizedCity);
    if (cached) {
      return of(cached);
    }

    const indexed = this.citySuggestionIndex.get(normalizedCity);
    if (indexed && indexed.length > 0) {
      return of(indexed.slice(0, 8));
    }

    const inherited = this.getCachedCitySuggestions(normalizedCity);
    if (inherited.length > 0 && normalizedCity.length <= 4) {
      return of(inherited.slice(0, 8));
    }

    // Ultra-fast local first
    const localMatch = this.getLocalCities(normalizedCity);
    if (localMatch.length > 0) {
      this.cacheCitySuggestions(normalizedCity, localMatch);
      return of(localMatch);
    }

    return this.http.get<any>(`${this.geocodingApiUrl}?name=${encodeURIComponent(normalizedCity)}&count=8&language=en&format=json`)
      .pipe(
        map(response => this.sanitizeSuggestions(response.results || [])),
        tap(results => {
          this.cacheCitySuggestions(normalizedCity, results);
        }),
        catchError(() => of([]))
      );
  }

  private indianCities: GeocodingResult[] = [];

  private async loadIndianCities(): Promise<void> {
    try {
      const candidateUrls = [
        '/assets/indian-cities-cache.json',
        '/src/app/components/city-search/indian-cities-cache.json'
      ];

      for (const url of candidateUrls) {
        try {
          const response = await fetch(url);
          if (!response.ok) {
            continue;
          }

          const data = await response.json();
          if (!Array.isArray(data)) {
            continue;
          }

          this.indianCities = this.sanitizeSuggestions(data).slice(0, 5000);
          this.buildLocalCityIndex(this.indianCities);
          return;
        } catch {
          // Try next source.
        }
      }
    } catch (e) {
      console.warn('Local cities not loaded, using API only');
    }
  }

  private buildLocalCityIndex(cities: GeocodingResult[]): void {
    for (const city of cities) {
      this.indexSuggestion(city.name.toLowerCase(), city);
      this.indexSuggestion(`${city.name} ${city.country}`.toLowerCase(), city);
      if (city.admin1) {
        this.indexSuggestion(`${city.name} ${city.admin1}`.toLowerCase(), city);
      }
    }
  }

  private cacheCitySuggestions(queryKey: string, results: GeocodingResult[]): void {
    this.citySearchCache.set(queryKey, results);

    for (const city of results) {
      this.indexSuggestion(city.name.toLowerCase(), city);
      this.indexSuggestion(`${city.name} ${city.country}`.toLowerCase(), city);
      if (city.admin1) {
        this.indexSuggestion(`${city.name} ${city.admin1}`.toLowerCase(), city);
      }
    }
  }

  private indexSuggestion(label: string, city: GeocodingResult): void {
    const clean = label.trim().toLowerCase();
    if (!clean) {
      return;
    }

    const maxPrefix = Math.min(clean.length, 6);
    for (let i = 1; i <= maxPrefix; i++) {
      this.pushIndexedSuggestion(clean.slice(0, i), city);
    }

    const tokens = clean.split(/\s+/g).filter(Boolean);
    for (const token of tokens) {
      const tokenMaxPrefix = Math.min(token.length, 6);
      for (let i = 1; i <= tokenMaxPrefix; i++) {
        this.pushIndexedSuggestion(token.slice(0, i), city);
      }
    }
  }

  private pushIndexedSuggestion(key: string, city: GeocodingResult): void {
    const existing = this.citySuggestionIndex.get(key) || [];
    const alreadyExists = existing.some((item) =>
      item.name === city.name && item.country === city.country && (item.admin1 || '') === (city.admin1 || '')
    );

    if (alreadyExists) {
      return;
    }

    const next = [...existing, city].slice(0, 30);
    this.citySuggestionIndex.set(key, next);
  }

  private getLocalCities(query: string): GeocodingResult[] {
    if (this.indianCities.length === 0) {
      return [];
    }
    const q = query.toLowerCase();
    return this.indianCities
      .filter(city => city.name.toLowerCase().startsWith(q))  // Exact prefix match only
      .slice(0, 4);  // Max 4 similar names
  }

  getWeather(latitude: number, longitude: number, locationName: string): Observable<WeatherData> {
    const paramsObj: { [key: string]: string } = {
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      hourly: 'temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m,precipitation_probability,surface_pressure,visibility',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,wind_speed_10m_max,precipitation_probability_max,sunrise,sunset',
      current: 'temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m,apparent_temperature,precipitation',
      timezone: 'auto',
      forecast_days: '14',
      temperature_unit: 'celsius'
    };

    const params = new HttpParams({ fromObject: paramsObj });

    const simplifiedParams = new HttpParams({ fromObject: {
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      hourly: 'temperature_2m,weather_code',
      daily: 'temperature_2m_max,temperature_2m_min',
      current: 'temperature_2m,weather_code',
      timezone: 'auto',
      forecast_days: '7',
      temperature_unit: 'celsius'
    } });

    return this.http.get<any>(this.weatherApiUrl, { params }).pipe(
      catchError(err => {
        console.warn('getWeather primary request failed, status:', err?.status, '- attempting simplified retry');
        if (err && err.status === 400) {
          return this.http.get<any>(this.weatherApiUrl, { params: simplifiedParams });
        }
        return throwError(() => err);
      }),
      map(response => {
        const hourlySource = response.hourly || {};
        const dailySource = response.daily || {};

        const times = hourlySource.time || [];
        const tempArr = hourlySource.temperature_2m || hourlySource.temperature || [];
        const weatherCodeArr = hourlySource.weathercode || hourlySource.weather_code || [];
        const humidityArr = hourlySource.relativehumidity_2m || hourlySource.relative_humidity_2m || [];
        const windArr = hourlySource.wind_speed_10m || hourlySource.wind_speed || [];
        const precipProbArr = hourlySource.precipitation_probability || [];
        const pressureArr = hourlySource.surface_pressure || [];
        const visibilityArr = hourlySource.visibility || [];

        const hourlyCount = Math.min(48, times.length);
        const hourly: HourlyForecast[] = [];
        for (let i = 0; i < hourlyCount; i++) {
          hourly.push({
            time: times[i],
            temperature: Math.round((tempArr[i] ?? 0)),
            weatherCode: weatherCodeArr[i] ?? 0,
            humidity: humidityArr[i] ?? 0,
            windSpeed: Math.round(windArr[i] ?? 0),
            precipitationProbability: precipProbArr[i] ?? 0
          });
        }

        const dailyTimes = dailySource.time || [];
        const dailyTempMax = dailySource.temperature_2m_max || dailySource.temperature_max || [];
        const dailyTempMin = dailySource.temperature_2m_min || dailySource.temperature_min || [];
        const dailyWeatherCode = dailySource.weathercode || dailySource.weather_code || [];
        const dailyHumidity = dailySource.relativehumidity_2m_mean || dailySource.relative_humidity_2m_mean || [];
        const dailyWind = dailySource.wind_speed_10m_max || dailySource.wind_speed_max || [];
        const dailyPrecip = dailySource.precipitation_probability_max || [];

        const forecast: DailyForecast[] = dailyTimes.map((date: string, index: number) => ({
          date: date,
          temperatureMax: Math.round(dailyTempMax[index] ?? 0),
          temperatureMin: Math.round(dailyTempMin[index] ?? 0),
          weatherCode: dailyWeatherCode[index] ?? 0,
          humidity: dailyHumidity[index] ?? 0,
          windSpeed: dailyWind[index] ?? 0,
          precipitationProbability: dailyPrecip[index] ?? 0,
          sunrise: dailySource.sunrise?.[index] || '',
          sunset: dailySource.sunset?.[index] || ''
        }));

        // current can be in response.current_weather or response.current
        const currentSrc = response.current_weather || response.current || {};
        const currentTemp = currentSrc.temperature_2m ?? currentSrc.temperature ?? 0;
        const currentWeatherCode = currentSrc.weathercode ?? currentSrc.weather_code ?? 0;
        const currentHumidity = currentSrc.relativehumidity_2m ?? currentSrc.relative_humidity_2m ?? 0;
        const currentWind = currentSrc.wind_speed_10m ?? currentSrc.windspeed ?? 0;
        const currentFeels = currentSrc.apparent_temperature ?? currentSrc.feels_like ?? currentTemp;
        const currentPrecip = currentSrc.precipitation ?? 0;
        const currentUV = currentSrc.uv_index ?? 0;
        
        // Get pressure and visibility from hourly data (first hour)
        const currentPressure = pressureArr.length > 0 ? pressureArr[0] : 0;
        const currentVisibility = visibilityArr.length > 0 ? visibilityArr[0] : 0;

        const weatherData: WeatherData = {
          location: locationName,
          latitude: Number(latitude),
          longitude: Number(longitude),
          current: {
            temperature: Math.round(currentTemp),
            weatherCode: currentWeatherCode,
            humidity: currentHumidity,
            windSpeed: Math.round(currentWind),
            feelsLike: Math.round(currentFeels),
            precipitation: currentPrecip,
            uvIndex: currentUV,
            pressure: Math.round(currentPressure),
            visibility: Math.round(currentVisibility)
          },
          hourly: hourly,
          forecast: forecast
        };

        if (!this.isValidWeatherData(weatherData)) {
          throw new Error('INVALID_WEATHER_RESPONSE');
        }

        return weatherData;
      }),
      tap((weatherData) => {
        this.persistLastKnownWeather(weatherData);
      }),
      catchError(err => {
        console.error('getWeather HTTP error (mapped in service):', err);
        return throwError(() => err);
      })
    );
  }

  async searchWeather(cityName: string): Promise<void> {
    const normalizedQuery = cityName.trim().toLowerCase();
    if (!normalizedQuery) {
      this.error.set('Please enter a city name to continue.');
      return;
    }

    const currentLocation = (this.currentWeather()?.location || '').toLowerCase();
    if (currentLocation.startsWith(normalizedQuery + ',') || currentLocation === normalizedQuery) {
      this.error.set(null);
      this.isLoading.set(false);
      return;
    }

    const existingSearch = this.inFlightWeatherSearches.get(normalizedQuery);
    if (existingSearch) {
      await existingSearch;
      return;
    }

    const searchPromise = this.searchWeatherInternal(cityName.trim(), normalizedQuery);
    this.inFlightWeatherSearches.set(normalizedQuery, searchPromise);

    try {
      await searchPromise;
    } finally {
      this.inFlightWeatherSearches.delete(normalizedQuery);
    }
  }

  async searchWeatherBySelection(selection: GeocodingResult): Promise<void> {
    if (!selection?.name || !Number.isFinite(selection.latitude) || !Number.isFinite(selection.longitude)) {
      this.error.set('Please select a valid city.');
      return;
    }

    const cityKey = `${selection.name}, ${selection.country}`.trim().toLowerCase();
    const existingSearch = this.inFlightWeatherSearches.get(cityKey);
    if (existingSearch) {
      await existingSearch;
      return;
    }

    const current = this.currentWeather();
    if (current && Number.isFinite(current.latitude) && Number.isFinite(current.longitude)) {
      const sameLat = Math.abs((current.latitude || 0) - selection.latitude) < 0.001;
      const sameLon = Math.abs((current.longitude || 0) - selection.longitude) < 0.001;
      if (sameLat && sameLon) {
        this.error.set(null);
        this.isLoading.set(false);
        return;
      }
    }

    const searchPromise = this.searchWeatherFromCoordinates(selection.latitude, selection.longitude, `${selection.name}, ${selection.country}`);
    this.inFlightWeatherSearches.set(cityKey, searchPromise);

    try {
      await searchPromise;
    } finally {
      this.inFlightWeatherSearches.delete(cityKey);
    }
  }

  private async searchWeatherInternal(cityName: string, normalizedQuery: string): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const results = await firstValueFrom(this.searchCity(cityName));

      if (!results || results.length === 0) {
        this.error.set('City not found. Please try another search.');
        return;
      }

      const bestMatch = results.find((result) => result.name.toLowerCase() === normalizedQuery) || results[0];
      const locationName = `${bestMatch.name}, ${bestMatch.country}`;
      const cached = this.readWeatherFromMemoryCache(bestMatch.latitude, bestMatch.longitude);
      if (cached) {
        this.currentWeather.set(cached);
        this.initialized.set(true);
        this.error.set(null);
        return;
      }

      const weatherData = await firstValueFrom(this.getWeather(bestMatch.latitude, bestMatch.longitude, locationName));
      this.writeWeatherToMemoryCache(bestMatch.latitude, bestMatch.longitude, weatherData);
      this.currentWeather.set(weatherData);
      this.initialized.set(true);
      this.error.set(null);
    } catch (err) {
      console.error('searchWeather error:', err);
      this.error.set('Weather service is temporarily unavailable. Please try again in a moment.');
    } finally {
      this.isLoading.set(false);
    }
  }

  private async searchWeatherFromCoordinates(latitude: number, longitude: number, locationName: string): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const cached = this.readWeatherFromMemoryCache(latitude, longitude);
      if (cached) {
        this.currentWeather.set(cached);
        this.initialized.set(true);
        this.error.set(null);
        return;
      }

      const weatherData = await firstValueFrom(this.getWeather(latitude, longitude, locationName));
      this.writeWeatherToMemoryCache(latitude, longitude, weatherData);
      this.currentWeather.set(weatherData);
      this.initialized.set(true);
      this.error.set(null);
    } catch (err) {
      console.error('searchWeatherBySelection error:', err);
      this.error.set('Weather service is temporarily unavailable. Please try again in a moment.');
    } finally {
      this.isLoading.set(false);
    }
  }

  clearWeather(): void {
    this.currentWeather.set(null);
    this.error.set(null);
  }

  getUserLocationWeather(): void {
    if (this.isLoading()) {
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);

    // Check if we have a cached user location
    const cachedLocation = this.getCachedUserLocation();
    if (cachedLocation) {
      console.log('📍 Using cached location:', cachedLocation.name, 'Lat:', cachedLocation.latitude, 'Lon:', cachedLocation.longitude);
      // Load weather for cached location
      this.getWeather(cachedLocation.latitude, cachedLocation.longitude, cachedLocation.name).subscribe({
        next: (weatherData) => {
          this.currentWeather.set(weatherData);
          this.isLoading.set(false);
          this.initialized.set(true);
        },
        error: () => {
          // If cached location fails, try fresh geolocation
          this.detectUserLocationViaIP();
        }
      });
      return;
    }

    // No cache, detect via IP first (more reliable for actual city)
    console.log('🔍 No cached location found. Starting fresh geolocation detection...');
    this.detectUserLocationViaIP();
  }

  private detectUserLocationViaIP(): void {
    // Use IP-based geolocation as primary - it's more reliable for determining actual city
    this.http.get<any>('https://ipapi.co/json/')
      .subscribe({
        next: (ipData) => {
          const ipCity = ipData.city?.toLowerCase().trim();
          const ipCountry = ipData.country_name || ipData.country;
          console.log('🌐 IP API returned - City:', ipData.city, 'Country:', ipCountry);
          
          // Find matching city from curated list (case-insensitive)
          const matchedCity = this.curatedCities.find(
            city => city.name.toLowerCase() === ipCity
          );

          if (matchedCity) {
            console.log('✅ Matched city from IP:', matchedCity.name, '| Lat:', matchedCity.latitude, 'Lon:', matchedCity.longitude);
            this.cacheUserLocation(matchedCity);
            
            this.getWeather(matchedCity.latitude, matchedCity.longitude, matchedCity.name).subscribe({
              next: (weatherData) => {
                console.log('✅ Weather loaded for:', weatherData.location);
                this.currentWeather.set(weatherData);
                this.isLoading.set(false);
                this.initialized.set(true);
              },
              error: () => {
                console.error('Weather fetch failed for IP city, trying GPS...');
                this.detectUserLocationViaGPS();
              }
            });
          } else {
            console.log('❌ IP city "' + ipData.city + '" not in curated list. Available cities:', this.curatedCities.map(c => c.name).join(', '));
            console.log('Falling back to GPS...');
            // IP gave us a city not in our list, fall back to GPS
            this.detectUserLocationViaGPS();
          }
        },
        error: (err) => {
          console.log('IP geolocation failed:', err.message, '- trying GPS...');
          this.detectUserLocationViaGPS();
        }
      });
  }

  private detectUserLocationViaGPS(): void {
    // Fallback to GPS-based detection only if IP fails
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      const geoOptions: PositionOptions = {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0
      };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLat = position.coords.latitude;
          const userLon = position.coords.longitude;
          
          console.log('📍 GPS detected - Lat:', userLat, 'Lon:', userLon);
          
          // Find closest city from curated list
          const closestCity = this.findClosestCity(userLat, userLon);
          const distance = this.calculateDistance(userLat, userLon, closestCity.latitude, closestCity.longitude);
          console.log('✅ Closest city from GPS:', closestCity.name, '| Distance:', distance.toFixed(2) + ' km');
          
          // Cache the detected location
          this.cacheUserLocation(closestCity);
          
          this.getWeather(closestCity.latitude, closestCity.longitude, closestCity.name).subscribe({
            next: (weatherData) => {
              console.log('Weather loaded for:', weatherData.location);
              this.currentWeather.set(weatherData);
              this.isLoading.set(false);
              this.initialized.set(true);
            },
            error: () => {
              console.error('Weather fetch failed for GPS city');
              this.loadFallbackCity();
            }
          });
        },
        (error) => {
          console.log('GPS geolocation failed:', error.message);
          this.loadFallbackCity();
        },
        geoOptions
      );
    } else {
      console.log('GPS not available');
      this.loadFallbackCity();
    }
  }

  private loadFallbackCity(): void {
    // Use Kishangarh as fallback (not Jaipur)
    const fallbackCity = this.curatedCities.find(city => city.name === this.fallbackCity) || this.curatedCities[2]; // Kishangarh
    console.log('⚠️ Loading fallback city:', fallbackCity.name, 'Lat:', fallbackCity.latitude, 'Lon:', fallbackCity.longitude);
    this.cacheUserLocation(fallbackCity);
    
    this.getWeather(fallbackCity.latitude, fallbackCity.longitude, fallbackCity.name).subscribe({
      next: (weatherData) => {
        console.log('✅ Weather loaded for fallback city:', weatherData.location);
        this.currentWeather.set(weatherData);
        this.isLoading.set(false);
        this.initialized.set(true);
      },
      error: () => {
        this.isLoading.set(false);
        this.error.set('Failed to load location weather');
      }
    });
  }

  private getCachedUserLocation(): GeocodingResult | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    try {
      const cached = localStorage.getItem(this.userLocationCacheKey);
      if (!cached) {
        return null;
      }

      const { data, timestamp } = JSON.parse(cached);
      const age = Date.now() - timestamp;

      // Check if cache is still valid (7 days)
      if (age > this.userLocationCacheTtlMs) {
        localStorage.removeItem(this.userLocationCacheKey);
        return null;
      }

      return data as GeocodingResult;
    } catch (error) {
      console.error('Error reading cached user location:', error);
      return null;
    }
  }

  private cacheUserLocation(city: GeocodingResult): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const cacheData = {
        data: city,
        timestamp: Date.now()
      };
      localStorage.setItem(this.userLocationCacheKey, JSON.stringify(cacheData));
    } catch (error) {
      console.error('Error caching user location:', error);
    }
  }

  refreshUserLocation(): void {
    // Clear the cached location to force re-detection on next request
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(this.userLocationCacheKey);
      } catch (error) {
        console.error('Error clearing cached user location:', error);
      }
    }
    // Detect location again
    this.getUserLocationWeather();
  }

  setPreferredCity(cityName: string): void {
    const city = this.curatedCities.find(c => c.name.toLowerCase() === cityName.toLowerCase());
    if (city) {
      // Save as preferred city
      try {
        localStorage.setItem(this.preferredCityKey, city.name);
        console.log('💾 Saved preferred city:', city.name);
      } catch (error) {
        console.error('Error saving preferred city:', error);
      }

      // Cache this as the user's preferred location
      this.cacheUserLocation(city);
      // Load weather for this city
      this.getWeather(city.latitude, city.longitude, city.name).subscribe({
        next: (weatherData) => {
          this.currentWeather.set(weatherData);
          this.isLoading.set(false);
          this.initialized.set(true);
        },
        error: (err) => {
          this.error.set('Failed to load weather for ' + cityName);
          this.isLoading.set(false);
        }
      });
    } else {
      this.error.set('City not found: ' + cityName);
    }
  }

  private findClosestCity(userLat: number, userLon: number): GeocodingResult {
    let closestCity = this.curatedCities[0];
    let minDistance = this.calculateDistance(userLat, userLon, closestCity.latitude, closestCity.longitude);
    const distanceLog: string[] = [`${closestCity.name}: ${minDistance.toFixed(2)} km`];

    for (let i = 1; i < this.curatedCities.length; i++) {
      const city = this.curatedCities[i];
      const distance = this.calculateDistance(userLat, userLon, city.latitude, city.longitude);
      distanceLog.push(`${city.name}: ${distance.toFixed(2)} km`);
      
      if (distance < minDistance) {
        minDistance = distance;
        closestCity = city;
      }
    }

    console.log('📊 Distance calculation from your GPS coords:', distanceLog.join(' | '));
    return closestCity;
  }

  private getPreferredCity(): GeocodingResult | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    try {
      const preferred = localStorage.getItem(this.preferredCityKey);
      if (!preferred) {
        return null;
      }

      const cityName = preferred;
      const city = this.curatedCities.find(c => c.name.toLowerCase() === cityName.toLowerCase());
      console.log('🏠 Retrieved preferred city from storage:', cityName);
      return city || null;
    } catch (error) {
      console.error('Error reading preferred city:', error);
      return null;
    }
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private getIPBasedLocationWeather(): void {
    this.http.get<any>('https://ipapi.co/json/')
      .subscribe({
        next: (ipData) => {
          const lat = ipData.latitude ?? ipData.lat;
          const lon = ipData.longitude ?? ipData.lon;
          if (lat && lon) {
            const locationName = `${ipData.city || 'Unknown'}, ${ipData.country_name || ipData.country || ''}`;
            this.getWeather(lat, lon, locationName).subscribe({
              next: (weatherData) => {
                this.currentWeather.set(weatherData);
                this.isLoading.set(false);
                this.initialized.set(true);
              },
              error: (err) => {
                console.error('Weather fetch for IP-based location failed:', err);
                this.loadFallbackCityWeather();
              }
            });
          } else {
            console.error('IP-based geolocation failed (no lat/lon):', ipData);
            this.loadFallbackCityWeather();
          }
        },
        error: (err) => {
          console.error('IP API request failed:', err);
          this.loadFallbackCityWeather();
        }
      });
  }

  private loadFallbackCityWeather(): void {
    const fallbackLocationName = `${this.fallbackCity}, India`;

    this.getWeather(
      this.fallbackCoordinates.latitude,
      this.fallbackCoordinates.longitude,
      fallbackLocationName
    ).subscribe({
      next: (weatherData) => {
        this.currentWeather.set(weatherData);
        this.isLoading.set(false);
        this.initialized.set(true);
      },
      error: (directErr) => {
        console.error('Direct fallback weather fetch failed, trying geocoded fallback city:', directErr);

        this.searchCity(this.fallbackCity).subscribe({
          next: (results) => {
            if (results.length === 0) {
              this.showCachedOrEmergencyWeather();
              return;
            }

            const city = results[0];
            const locationName = `${city.name}, ${city.country}`;
            this.getWeather(city.latitude, city.longitude, locationName).subscribe({
              next: (weatherData) => {
                this.currentWeather.set(weatherData);
                this.isLoading.set(false);
                this.initialized.set(true);
              },
              error: () => {
                this.showCachedOrEmergencyWeather();
              }
            });
          },
          error: () => {
            this.showCachedOrEmergencyWeather();
          }
        });
      }
    });
  }

  private persistLastKnownWeather(weatherData: WeatherData): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    if (this.lockPreferredCity) {
      const location = (weatherData.location || '').toLowerCase();
      if (!location.includes(this.fallbackCity.toLowerCase())) {
        return;
      }
    }

    try {
      window.localStorage.setItem(this.cachedWeatherKey, JSON.stringify(weatherData));
    } catch {
      // Ignore storage failures (quota/private mode).
    }
  }

  private readLastKnownWeather(): WeatherData | null {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }

    try {
      const raw = window.localStorage.getItem(this.cachedWeatherKey);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as WeatherData;
      if (!this.isValidWeatherData(parsed)) {
        return null;
      }

      if (this.lockPreferredCity) {
        const location = (parsed.location || '').toLowerCase();
        if (!location.includes(this.fallbackCity.toLowerCase())) {
          return null;
        }
      }

      return parsed;
    } catch {
      return null;
    }
  }

  private buildEmergencyWeather(): WeatherData {
    const now = new Date();
    const hourly: HourlyForecast[] = [];
    const forecast: DailyForecast[] = [];

    for (let i = 0; i < 24; i++) {
      const slot = new Date(now.getTime() + i * 60 * 60 * 1000);
      const baseTemp = 29 + Math.sin((i / 24) * Math.PI * 2) * 5;
      hourly.push({
        time: slot.toISOString(),
        temperature: Math.round(baseTemp),
        weatherCode: 1,
        humidity: 45,
        windSpeed: 14,
        precipitationProbability: i % 5 === 0 ? 20 : 5
      });
    }

    for (let i = 0; i < 14; i++) {
      const day = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
      forecast.push({
        date: day.toISOString().slice(0, 10),
        temperatureMax: 34,
        temperatureMin: 24,
        weatherCode: 1,
        humidity: 45,
        windSpeed: 14,
        precipitationProbability: 10,
        sunrise: `${day.toISOString().slice(0, 10)}T01:00`,
        sunset: `${day.toISOString().slice(0, 10)}T13:00`
      });
    }

    return {
      location: `${this.fallbackCity}, India`,
      latitude: this.fallbackCoordinates.latitude,
      longitude: this.fallbackCoordinates.longitude,
      current: {
        temperature: 30,
        weatherCode: 1,
        humidity: 45,
        windSpeed: 14,
        feelsLike: 32,
        precipitation: 0,
        uvIndex: 7,
        pressure: 1007,
        visibility: 9000
      },
      hourly,
      forecast
    };
  }

  private showCachedOrEmergencyWeather(): void {
    const cached = this.readLastKnownWeather();
    if (cached) {
      this.currentWeather.set(cached);
      this.error.set(null);
      this.isLoading.set(false);
      this.initialized.set(true);
      return;
    }

    const emergency = this.buildEmergencyWeather();
    this.currentWeather.set(emergency);
    this.error.set(null);
    this.isLoading.set(false);
    this.initialized.set(true);
  }

  private sanitizeSuggestions(results: GeocodingResult[]): GeocodingResult[] {
    return (results || [])
      .filter((item) => !!item?.name && !!item?.country && Number.isFinite(item?.latitude) && Number.isFinite(item?.longitude))
      .map((item) => ({
        name: String(item.name).trim(),
        latitude: Number(item.latitude),
        longitude: Number(item.longitude),
        country: String(item.country).trim(),
        admin1: item.admin1 ? String(item.admin1).trim() : undefined
      }));
  }

  private buildWeatherCacheKey(latitude: number, longitude: number): string {
    return `${latitude.toFixed(3)}|${longitude.toFixed(3)}`;
  }

  private readWeatherFromMemoryCache(latitude: number, longitude: number): WeatherData | null {
    const key = this.buildWeatherCacheKey(latitude, longitude);
    const entry = this.weatherResponseCache.get(key);
    if (!entry) {
      return null;
    }

    if (Date.now() - entry.timestamp > this.weatherCacheTtlMs) {
      this.weatherResponseCache.delete(key);
      return null;
    }

    return entry.data;
  }

  private writeWeatherToMemoryCache(latitude: number, longitude: number, data: WeatherData): void {
    const key = this.buildWeatherCacheKey(latitude, longitude);
    this.weatherResponseCache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  isValidWeatherData(data: WeatherData | null | undefined): data is WeatherData {
    if (!data || !data.current) {
      return false;
    }

    const hasValidCurrent =
      Number.isFinite(data.current.temperature) &&
      Number.isFinite(data.current.feelsLike) &&
      Number.isFinite(data.current.windSpeed) &&
      Number.isFinite(data.current.humidity) &&
      Number.isFinite(data.current.weatherCode);

    const hasHourly = Array.isArray(data.hourly) && data.hourly.length > 0;
    const hasForecast = Array.isArray(data.forecast) && data.forecast.length > 0;

    return hasValidCurrent && hasHourly && hasForecast;
  }
}
