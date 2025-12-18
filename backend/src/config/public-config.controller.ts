import { Controller, Get } from "@nestjs/common";
import { AppConfigService } from "./app-config.service";

// Public read-only endpoint to fetch branding/theme without auth (for login page)
@Controller('config/public')
export class PublicConfigController {
  constructor(private appConfigService: AppConfigService) {}

  @Get()
  async getPublicConfig() {
    return this.appConfigService.getPublicConfig();
  }
}
