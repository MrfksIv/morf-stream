import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller('api') // We prefix with 'api' to keep it clean
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('videos')
  async getVideos() {
    return this.appService.getVideos();
  }
}
