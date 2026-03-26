import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

interface Feedback {
  message: string;
  submitted: boolean;
  timestamp: Date;
}

@Component({
  selector: 'app-feedback',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './feedback.component.html',
  styleUrls: ['./feedback.component.css']
})
export class FeedbackComponent {
  feedback = signal('');
  submittedFeedbacks = signal<Feedback[]>([]);
  isSubmitting = signal(false);

  submitFeedback() {
    if (this.feedback().trim()) {
      this.isSubmitting.set(true);
      
      setTimeout(() => {
        this.submittedFeedbacks.update(fbs => [
          { message: this.feedback(), submitted: true, timestamp: new Date() },
          ...fbs.slice(0, 4) // Keep last 5
        ]);
        this.feedback.set('');
        this.isSubmitting.set(false);
        console.log('Feedback submitted:', this.feedback());
      }, 1000);
    }
  }
}
