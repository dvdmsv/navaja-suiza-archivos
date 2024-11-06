import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PdfUploadComponent } from "./pdf-upload/pdf-upload.component";

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, PdfUploadComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'merge-pdf';
}
