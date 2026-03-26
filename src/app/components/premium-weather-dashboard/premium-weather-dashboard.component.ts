import { Component, ViewChild, ElementRef, AfterViewInit, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import Chart from 'chart.js/auto';
import { WeatherService } from '../../services/weather.service';

interface HourlyForecast {
  time: string;
  temp: number;
  condition: string;
  precip: number;
  icon: string;
}

@Component({
  selector: 'app-premium-weather-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './premium-weather-dashboard.component.html',
  styleUrls: ['./premium-weather-dashboard.component.css']
})
export class PremiumWeatherDashboardComponent implements OnInit, AfterViewInit {
  @ViewChild('tempGraph') chartRef!: ElementRef<HTMLCanvasElement>;

  currentLocation = 'New York, NY';
  currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  hourlyForecast: HourlyForecast[] = [];
  selectedHour = 0;
  highlightPosition = 0;

  private chart: Chart | null = null;

  constructor(private weatherService: WeatherService) {}



  ngOnInit() {

    // Poll for signal changes
    const checkWeather = () => {
      const weather = this.weatherService.currentWeather();
      if (weather && weather.hourly && weather.hourly.length > 0) {
        this.hourlyForecast = weather.hourly.slice(0,12).map(h => ({
          time: new Date(h.time).toLocaleTimeString([], {hour: 'numeric', minute: 'numeric'}),
          temp: h.temperature,
          condition: this.weatherService.getWeatherDescription(h.weatherCode).toLowerCase(),

          precip: Math.round(h.precipitationProbability),

          icon: this.weatherService.getWeatherIcon(h.weatherCode)
        }));
        this.currentLocation = weather.location;
      } else {
        this.generateDemoData();
      }
    };
    
    checkWeather();
    const interval = setInterval(checkWeather, 1000);
    setTimeout(() => clearInterval(interval), 10000); // stop after 10s

    this.updateTime();
  }



  ngAfterViewInit() {
    setTimeout(() => {
      this.createChart();
      this.updateHighlight();
    }, 100);
  }

  private generateDemoData() {
    const times = ['7 PM', 'Now', '11 PM', '1 AM', '3 AM', '5 AM', '7 AM', '9 AM', '11 AM', '1 PM', '3 PM', '5 PM'];
    const conditions = ['clear', 'clear', 'cloudy', 'night', 'rain', 'rain', 'cloudy', 'clear', 'clear', 'clear', 'rain', 'cloudy'];
    
    this.hourlyForecast = times.map((time, index) => ({
      time,
      temp: 65 + Math.sin(index / 3) * 20 + (Math.random() - 0.5) * 5,
      condition: conditions[index],
      precip: conditions[index] === 'rain' ? 35 + Math.random() * 30 : Math.random() * 15,
      icon: this.getIcon(conditions[index])
    }));

    // Set "Now" as selected
    this.selectedHour = 1;
  }

  getIcon(condition: string): string {
    return {
      clear: '☀️',
      cloudy: '☁️', 
      rain: '🌧️',
      night: '🌙'
    }[condition] || '🌤️';
  }

  selectHour(index: number) {
    this.selectedHour = index;
    this.updateHighlight();
  }

  private updateHighlight() {
    this.highlightPosition = (this.selectedHour / (this.hourlyForecast.length - 1)) * 100;
    
    if (this.chart) {
      this.chart.setActiveElements([{ datasetIndex: 0, index: this.selectedHour }]);
      this.chart.update('none');
    }
  }

  private updateTime() {
    this.currentTime = new Date().toLocaleTimeString([], { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
    setTimeout(() => this.updateTime(), 60000);
  }

  private createChart() {
    if (!this.chartRef?.nativeElement) return;

    this.chart = new Chart(this.chartRef.nativeElement, {
      type: 'line' as const,
      data: {
        labels: this.hourlyForecast.map(h => h.time),
        datasets: [{
          label: 'Temperature',
          data: this.hourlyForecast.map(h => Math.round(h.temp)),
          borderColor: '#f97316',
          backgroundColor: 'rgba(249, 115, 22, 0.2)',
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#ffffff',
          pointBorderColor: '#f97316',
          pointBorderWidth: 3,
          pointRadius: 6,
          pointHoverRadius: 10,
          pointHoverBorderWidth: 2,
          pointHoverBackgroundColor: '#f97316'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false
        },
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.1)' },
            ticks: { color: 'rgba(255,255,255,0.7)' }
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: 'rgba(255,255,255,0.6)' }
          }
        }
      }
    });
  }

  ngOnDestroy() {
    if (this.chart) {
      this.chart.destroy();
    }
  }
}

