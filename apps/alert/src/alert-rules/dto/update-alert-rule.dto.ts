import { IsString, IsOptional, IsBoolean, IsEnum, IsUrl, IsInt, Min, ValidateIf } from 'class-validator'
import { Type } from 'class-transformer'
import { ConditionType, AlertChannel } from './create-alert-rule.dto'

export class UpdateAlertRuleDto {
  @IsString()
  @IsOptional()
  name?: string

  @IsString()
  @IsOptional()
  description?: string

  @IsBoolean()
  @IsOptional()
  enabled?: boolean

  @IsEnum(ConditionType)
  @IsOptional()
  conditionType?: ConditionType

  @IsString()
  @IsOptional()
  eventName?: string

  @IsString()
  @IsOptional()
  propertyPath?: string

  @IsString()
  @IsOptional()
  propertyValue?: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  thresholdCount?: number

  @Type(() => Number)
  @IsInt()
  @Min(10)
  @IsOptional()
  windowSeconds?: number

  @IsEnum(AlertChannel)
  @IsOptional()
  channel?: AlertChannel

  @ValidateIf((o: UpdateAlertRuleDto) => o.channel === AlertChannel.WEBHOOK)
  @IsUrl()
  @IsOptional()
  webhookUrl?: string

  @ValidateIf((o: UpdateAlertRuleDto) => o.channel === AlertChannel.SLACK)
  @IsUrl()
  @IsOptional()
  slackWebhookUrl?: string

  @ValidateIf((o: UpdateAlertRuleDto) => o.channel === AlertChannel.EMAIL)
  @IsString()
  @IsOptional()
  recipientEmail?: string
}
