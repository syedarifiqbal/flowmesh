import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

@Injectable()
export class EncryptionService {
  private readonly key: Buffer

  constructor(private readonly config: ConfigService) {
    this.key = Buffer.from(config.get<string>('CONFIG_ENCRYPTION_KEY')!, 'hex')
  }

  encrypt(plaintext: string): { encrypted: string; iv: string } {
    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv(ALGORITHM, this.key, iv)
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()
    return {
      encrypted: Buffer.concat([encrypted, authTag]).toString('hex'),
      iv: iv.toString('hex'),
    }
  }

  decrypt(encrypted: string, iv: string): string {
    const data = Buffer.from(encrypted, 'hex')
    const authTag = data.subarray(-AUTH_TAG_LENGTH)
    const encryptedData = data.subarray(0, -AUTH_TAG_LENGTH)
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(iv, 'hex'))
    decipher.setAuthTag(authTag)
    return decipher.update(encryptedData).toString('utf8') + decipher.final('utf8')
  }
}
