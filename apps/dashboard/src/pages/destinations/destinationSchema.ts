import { z } from 'zod'

const isValidUrl = (v: string) => z.string().url().safeParse(v).success

export const DESTINATION_TYPES = ['webhook', 'postgres', 'slack', 'discord', 's3'] as const
export type DestinationType = (typeof DESTINATION_TYPES)[number]

// Config fields shared across create and edit schemas.
const configFields = {
  webhookUrl: z.string().optional(),
  secret: z.string().optional(),
  pgUrl: z.string().optional(),
  table: z.string().optional(),
  slackUrl: z.string().optional(),
  slackChannel: z.string().optional(),
  discordUrl: z.string().optional(),
  discordUsername: z.string().optional(),
  s3Bucket: z.string().optional(),
  s3Region: z.string().optional(),
  s3AccessKeyId: z.string().optional(),
  s3SecretAccessKey: z.string().optional(),
  s3Prefix: z.string().optional(),
}

// Create: type is required and determines which config fields are required.
export const createSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(100),
    type: z.enum(DESTINATION_TYPES),
    ...configFields,
  })
  .superRefine((data, ctx) => {
    if (data.type === 'webhook' && !isValidUrl(data.webhookUrl ?? '')) {
      ctx.addIssue({ code: 'custom', path: ['webhookUrl'], message: 'Enter a valid URL' })
    }
    if (data.type === 'postgres' && !data.pgUrl?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['pgUrl'], message: 'Connection URL is required' })
    }
    if (data.type === 'slack' && !isValidUrl(data.slackUrl ?? '')) {
      ctx.addIssue({ code: 'custom', path: ['slackUrl'], message: 'Enter a valid Slack webhook URL' })
    }
    if (data.type === 'discord' && !isValidUrl(data.discordUrl ?? '')) {
      ctx.addIssue({ code: 'custom', path: ['discordUrl'], message: 'Enter a valid Discord webhook URL' })
    }
    if (data.type === 's3') {
      if (!data.s3Bucket?.trim()) ctx.addIssue({ code: 'custom', path: ['s3Bucket'], message: 'Bucket name is required' })
      if (!data.s3Region?.trim()) ctx.addIssue({ code: 'custom', path: ['s3Region'], message: 'Region is required' })
      if (!data.s3AccessKeyId?.trim()) ctx.addIssue({ code: 'custom', path: ['s3AccessKeyId'], message: 'Access Key ID is required' })
      if (!data.s3SecretAccessKey?.trim()) ctx.addIssue({ code: 'custom', path: ['s3SecretAccessKey'], message: 'Secret Access Key is required' })
    }
  })

// Edit: type is read-only — only validate URLs if the user chose to fill them.
export const editSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(100),
    ...configFields,
  })
  .superRefine((data, ctx) => {
    if (data.webhookUrl && !isValidUrl(data.webhookUrl)) {
      ctx.addIssue({ code: 'custom', path: ['webhookUrl'], message: 'Enter a valid URL' })
    }
    if (data.slackUrl && !isValidUrl(data.slackUrl)) {
      ctx.addIssue({ code: 'custom', path: ['slackUrl'], message: 'Enter a valid Slack webhook URL' })
    }
    if (data.discordUrl && !isValidUrl(data.discordUrl)) {
      ctx.addIssue({ code: 'custom', path: ['discordUrl'], message: 'Enter a valid Discord webhook URL' })
    }
  })

export type CreateFormValues = z.infer<typeof createSchema>
export type EditFormValues = z.infer<typeof editSchema>

export const CREATE_INITIAL_VALUES: CreateFormValues = {
  name: '',
  type: 'webhook',
  webhookUrl: '',
  secret: '',
  pgUrl: '',
  table: '',
  slackUrl: '',
  slackChannel: '',
  discordUrl: '',
  discordUsername: '',
  s3Bucket: '',
  s3Region: '',
  s3AccessKeyId: '',
  s3SecretAccessKey: '',
  s3Prefix: '',
}
