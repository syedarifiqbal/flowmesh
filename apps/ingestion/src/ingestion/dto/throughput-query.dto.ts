import { IsIn, IsOptional } from 'class-validator'

export class ThroughputQueryDto {
  @IsOptional()
  @IsIn(['1h', '24h', '7d'])
  range?: '1h' | '24h' | '7d'
}
