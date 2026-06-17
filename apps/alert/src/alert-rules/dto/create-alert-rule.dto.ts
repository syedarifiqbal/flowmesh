import {
  IsString, IsOptional, IsBoolean, IsEnum, IsUrl, ValidateIf,
  IsNotEmpty, IsInt, Min,
} from 'class-validator'
import { Type } from 'class-transformer'

export enum ConditionType {
  ANY_EVENT = 'any_event',
  PROPERTY_EQUALS = 'property_equals',
  COUNT_THRESHOLD = 'count_threshold',
}

export enum AlertChannel {
  SLACK = 'slack',
  WEBHOOK = 'webhook',
  EMAIL = 'email',
}

export class CreateAlertRuleDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsString()
  @IsOptional()
  description?: string

  @IsBoolean()
  @IsOptional()
  enabled?: boolean

  @IsEnum(ConditionType)
  conditionType!: ConditionType

  @IsString()
  @IsOptional()
  eventName?: string

  @ValidateIf((o: CreateAlertRuleDto) => o.conditionType === ConditionType.PROPERTY_EQUALS)
  @IsString()
  @IsNotEmpty()
  propertyPath?: string

  @ValidateIf((o: CreateAlertRuleDto) => o.conditionType === ConditionType.PROPERTY_EQUALS)
  @IsString()
  @IsNotEmpty()
  propertyValue?: string

  @ValidateIf((o: CreateAlertRuleDto) => o.conditionType === ConditionType.COUNT_THRESHOLD)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  thresholdCount?: number

  @ValidateIf((o: CreateAlertRuleDto) => o.conditionType === ConditionType.COUNT_THRESHOLD)
  @Type(() => Number)
  @IsInt()
  @Min(10)
  windowSeconds?: number

  @IsEnum(AlertChannel)
  channel!: AlertChannel

  @ValidateIf((o: CreateAlertRuleDto) => o.channel === AlertChannel.WEBHOOK)
  @IsUrl()
  webhookUrl?: string

  @ValidateIf((o: CreateAlertRuleDto) => o.channel === AlertChannel.SLACK)
  @IsUrl()
  slackWebhookUrl?: string

  @ValidateIf((o: CreateAlertRuleDto) => o.channel === AlertChannel.EMAIL)
  @IsString()
  @IsNotEmpty()
  recipientEmail?: string
}
