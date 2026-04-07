import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, catchError, of, throwError, tap, switchMap, EMPTY } from 'rxjs';

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
  private fallbackCity = 'Kishangarh';
  private fallbackCoordinates = { latitude: 26.59006, longitude: 74.85397 };
  private lockPreferredCity = true;
  private cachedWeatherKey = 'my-weather-app:last-known-weather';
  private citySearchCache = new Map<string, GeocodingResult[]>();

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
    if (normalizedCity.length < 2) {
      return [];
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

  searchCity(cityName: string): Observable<GeocodingResult[]> {
    const normalizedCity = cityName.trim().toLowerCase();
    if (!normalizedCity) {
      return of([]);
    }

    const cached = this.citySearchCache.get(normalizedCity);
    if (cached) {
      return of(cached);
    }

    // Ultra-fast local first
    const localMatch = this.getLocalCities(normalizedCity);
    if (localMatch.length > 0) {
      this.citySearchCache.set(normalizedCity, localMatch);
      return of(localMatch);
    }

    return this.http.get<any>(`${this.geocodingApiUrl}?name=${encodeURIComponent(normalizedCity)}&count=8&language=en&format=json`)
      .pipe(
        map(response => this.sanitizeSuggestions(response.results || [])),
        tap(results => {
          this.citySearchCache.set(normalizedCity, results);
        }),
        catchError(() => of([]))
      );
  }

  private indianCities: GeocodingResult[] = [];

  private async loadIndianCities(): Promise<void> {
    try {
      const response = await fetch('/src/app/components/city-search/indian-cities-cache.json');
      this.indianCities = await response.json();
    } catch (e) {
      console.warn('Local cities not loaded, using API only');
    }
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
      forecast_days: '14'
    };

    const params = new HttpParams({ fromObject: paramsObj });

    const simplifiedParams = new HttpParams({ fromObject: {
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      hourly: 'temperature_2m,weather_code',
      daily: 'temperature_2m_max,temperature_2m_min',
      current: 'temperature_2m,weather_code',
      timezone: 'auto',
      forecast_days: '7'
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

  searchWeather(cityName: string): void {
    if (!cityName.trim()) {
      this.error.set('Please enter a city name to continue.');
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);

    this.searchCity(cityName).subscribe({
      next: (results) => {
        if (results.length === 0) {
          this.error.set('City not found. Please try another search.');
          this.isLoading.set(false);
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
            error: (err) => {
              console.error('Weather fetch error (subscribe):', err);
              this.error.set('Weather service is temporarily unavailable. Please try again in a moment.');
              this.isLoading.set(false);
            }
        });
      },
      error: (err) => {
        console.error('searchCity error:', err);
        this.error.set('Failed to search city. Please try again.');
        this.isLoading.set(false);
      }
    });
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

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      const geoOptions: PositionOptions = {
        enableHighAccuracy: false,
        timeout: 4000,
        maximumAge: 300000
      };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;

          this.getWeather(lat, lon, 'Current Location').subscribe({
            next: (weatherData) => {
              this.currentWeather.set(weatherData);
              this.isLoading.set(false);
              this.initialized.set(true);
            },
            error: () => {
              this.getIPBasedLocationWeather();
            }
          });
        },
        (error) => {
          console.log('Browser geolocation failed, trying IP-based location...');
          this.getIPBasedLocationWeather();
        },
        geoOptions
      );
    } else {
      this.getIPBasedLocationWeather();
    }
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



  private reverseGeocode(latitude: number, longitude: number): Observable<string> {
    const url = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${latitude}&longitude=${longitude}&language=en`;
    return this.http.get<any>(url).pipe(
      map(response => {
        if (response.results && response.results.length > 0) {
          const result = response.results[0];
          return `${result.name}, ${result.country || ''}`;
        }
        return 'Unknown Location';
      }),
      catchError(() => of('Unknown Location'))
    );
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
