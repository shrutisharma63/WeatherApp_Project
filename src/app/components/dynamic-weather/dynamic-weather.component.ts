import { Component, ViewChild, ElementRef, AfterViewInit, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import Chart from 'chart.js/auto';

interface HourlyWeather {
  time: string;
  temp: number;
  condition: string;
  precip: number;
  icon: string;
}

@Component({
  selector: 'app-dynamic-weather',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dynamic-weather.component.html',
  styleUrls: ['./dynamic-weather.component.css']
})
export class DynamicWeatherComponent implements OnInit, AfterViewInit {
  @ViewChild('tempChart') chartRef!: ElementRef<HTMLCanvasElement>;

  hourlyData: HourlyWeather[] = [];

  selectedHour: HourlyWeather | null = null;

  private chart: Chart | null = null;

  ngOnInit() {
    this.initializeData();
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.createChart();
      this.selectHour(0);
    }, 0);
  }

  private initializeData() {
    const rawData = [
      { time: 'Now', temp: 82, condition: 'clear', precip: 0 },
      { time: '1 PM', temp: 85, condition: 'clear', precip: 5 },
      { time: '2 PM', temp: 87, condition: 'cloudy', precip: 12 },
      { time: '3 PM', temp: 88, condition: 'rain', precip: 45 },
      { time: '4 PM', temp: 86, condition: 'rain', precip: 65 },
      { time: '5 PM', temp: 84, condition: 'cloudy', precip: 25 },
      { time: '6 PM', temp: 82, condition: 'clear', precip: 8 },
      { time: '7 PM', temp: 78, condition: 'night', precip: 2 },
      { time: '8 PM', temp: 75, condition: 'night', precip: 0 },
      { time: '9 PM', temp: 72, condition: 'cloudy', precip: 18 }
    ];

    this.hourlyData = rawData.map(item => ({
      ...item,
      icon: this.getIcon(item.condition)
    }));
  }

  getIcon(condition: string): string {
    const icons: {[key: string]: string} = {
      'clear': '☀️',
      'cloudy': '☁️',
      'rain': '🌧️',
      'night': '🌙'
    };
    return icons[condition] || '🌤️';
  }

  selectHour(index: number) {
    this.selectedHour = this.hourlyData[index];
    
    if (this.chart) {
      this.chart.setActiveElements([{ datasetIndex: 0, index }]);
      this.chart.update('none');
    }
  }

  private createChart() {
    if (!this.chartRef?.nativeElement) return;

    this.chart = new Chart(this.chartRef.nativeElement, {
      type: 'line' as const,
      data: {
        labels: this.hourlyData.map(h => h.time),
        datasets: [{
          label: 'Temperature (°F)',
          data: this.hourlyData.map(h => h.temp),
          borderColor: '#f97316',
          backgroundColor: 'rgba(249, 115, 22, 0.15)',
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#ffffff',
          pointBorderColor: '#f97316',
          pointBorderWidth: 3,
          pointRadius: 8,
          pointHoverRadius: 10,
          pointHoverBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: 'rgba(26, 31, 46, 0.95)',
            titleColor: 'white',
            bodyColor: 'white',
            borderColor: 'rgba(249, 115, 22, 0.3)',
            borderWidth: 1,
            cornerRadius: 12,
            displayColors: false
          }
        },
        scales: {
          x: {
            grid: { 
              color: 'rgba(255,255,255,0.1)' 
            },
            ticks: {
              color: 'rgba(255,255,255,0.8)',
              font: { 
                size: 12 
              }
            }
          },
          y: {
            grid: { 
              color: 'rgba(255,255,255,0.08)' 
            },
            ticks: { 
              color: 'rgba(255,255,255,0.6)' 
            }
          }
        },
        animation: {
          duration: 1500,
          easing: 'easeOutQuart'
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

